import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { clamp } from '../common/utils/clamp';
import { computePlayerPprFromContext } from './player-ppr.calculator';
import { computeTeamBaseTpr, type TeamTprInput } from './team-tpr.calculator';
import {
  isNationalTournamentContext,
  teamLooksLikeNationalSide,
  tournamentExperienceFromWcProfile,
} from './tournament-national.util';

export type OlsPowerSyncResult = {
  homeBaseTpr: number;
  awayBaseTpr: number;
  homeMatchPower: number;
  awayMatchPower: number;
  olsFactor: Record<string, unknown>;
};

@Injectable()
export class PowerRatingService {
  private readonly log = new Logger(PowerRatingService.name);

  constructor(private readonly prisma: PrismaService) {}

  resolveTeamTprKind(
    tournament: { type: string } | null | undefined,
    homeTeam: { wcGroup?: string | null; externalId?: string | null },
    awayTeam: { wcGroup?: string | null; externalId?: string | null },
  ): 'national' | 'club' {
    if (isNationalTournamentContext(tournament as never)) return 'national';
    if (teamLooksLikeNationalSide(homeTeam) && teamLooksLikeNationalSide(awayTeam)) {
      return 'national';
    }
    return 'club';
  }

  buildTeamTprInput(args: {
    kind: 'national' | 'club';
    team: { eloRating: number; wc2026Profile?: Prisma.JsonValue | null };
    snap: {
      leagueRank: number | null;
      points: number | null;
      recentForm: string | null;
      attackRating: number;
      defenseRating: number;
      injuryImpact: number;
      fatigueIndex: number;
    } | null | undefined;
    squadQualityScore: number;
  }): TeamTprInput {
    const s = args.snap;
    const availabilityScore = clamp(100 - (s?.injuryImpact ?? 0) * 7, 25, 100);
    const fatigueScore = clamp(100 - (s?.fatigueIndex ?? 0) * 10, 22, 100);
    const tacticalStabilityScore = 52;
    const tournamentExperienceScore =
      args.kind === 'national' ?
        tournamentExperienceFromWcProfile(args.team.wc2026Profile ?? null)
      : undefined;
    return {
      kind: args.kind,
      eloRating: args.team.eloRating,
      leagueRank: s?.leagueRank ?? null,
      points: s?.points ?? null,
      recentForm: s?.recentForm ?? null,
      attackRating: s?.attackRating ?? 50,
      defenseRating: s?.defenseRating ?? 50,
      squadQualityScore: args.squadQualityScore,
      tacticalStabilityScore,
      availabilityScore,
      fatigueScore,
      tournamentExperienceScore,
    };
  }

  /** 文档 §4：单场修正（简化：主场优势 + 伤停 + 疲劳） */
  matchPowerAdjustments(
    snap: { injuryImpact: number; fatigueIndex: number } | null | undefined,
    isHome: boolean,
  ): number {
    const inj = clamp(-(snap?.injuryImpact ?? 0) * 2.1, -8, 0);
    const fat = clamp(-(snap?.fatigueIndex ?? 0) * 1.35, -5, 2);
    const homeAdv = isHome ? 6 : 0;
    return homeAdv + inj + fat;
  }

  /**
   * 在单场预测生成后调用：根据本场快照计算 OLS 球队基础 TPR、单场战力、球员 PPR 并写库。
   */
  async syncFromMatch(matchId: string): Promise<OlsPowerSyncResult | null> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeTeam: true,
        awayTeam: true,
        teamSnapshots: true,
        tournament: true,
        playerSnapshots: { include: { player: true } },
      },
    });
    if (!match) return null;

    const kind = this.resolveTeamTprKind(match.tournament, match.homeTeam, match.awayTeam);
    const homeSnap = match.teamSnapshots.find((x) => x.isHome);
    const awaySnap = match.teamSnapshots.find((x) => !x.isHome);

    const homePs = match.playerSnapshots.filter((p) => p.teamId === match.homeTeamId);
    const awayPs = match.playerSnapshots.filter((p) => p.teamId === match.awayTeamId);

    const persistPlayer = async (ps: (typeof homePs)[number]) => {
      try {
        const { ppr, meta } = computePlayerPprFromContext({
          position: ps.player.position,
          profile: ps.player.profile,
          formScore: ps.formScore,
          fitnessScore: ps.fitnessScore,
          expectedStartProbability: ps.expectedStartProbability,
        });
        await this.prisma.player.update({
          where: { id: ps.playerId },
          data: {
            powerRating: ppr,
            powerRatingMeta: meta as Prisma.InputJsonValue,
            powerRatingAt: new Date(),
          },
        });
        return ppr;
      } catch (e) {
        this.log.warn(`player power skip ${ps.playerId}: ${e instanceof Error ? e.message : e}`);
        return null;
      }
    };

    const homePprList = (await Promise.all(homePs.map(persistPlayer))).filter(
      (x): x is number => x != null,
    );
    const awayPprList = (await Promise.all(awayPs.map(persistPlayer))).filter(
      (x): x is number => x != null,
    );

    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 55);
    const homeSquad = clamp(avg(homePprList), 35, 94);
    const awaySquad = clamp(avg(awayPprList), 35, 94);

    const homeInput = this.buildTeamTprInput({
      kind,
      team: match.homeTeam,
      snap: homeSnap ?? undefined,
      squadQualityScore: homeSquad,
    });
    const awayInput = this.buildTeamTprInput({
      kind,
      team: match.awayTeam,
      snap: awaySnap ?? undefined,
      squadQualityScore: awaySquad,
    });

    const homeOut = computeTeamBaseTpr(homeInput);
    const awayOut = computeTeamBaseTpr(awayInput);

    const homeMatchPower = clamp(
      homeOut.tpr + this.matchPowerAdjustments(homeSnap, true),
      30,
      99,
    );
    const awayMatchPower = clamp(
      awayOut.tpr + this.matchPowerAdjustments(awaySnap, false),
      30,
      99,
    );

    const now = new Date();
    await this.prisma.team.update({
      where: { id: match.homeTeamId },
      data: {
        powerRating: homeOut.tpr,
        powerRatingMeta: {
          modelVersion: 'OLS_TPR_V2',
          kind,
          components: homeOut.components,
          matchId,
        } as Prisma.InputJsonValue,
        powerRatingAt: now,
      },
    });
    await this.prisma.team.update({
      where: { id: match.awayTeamId },
      data: {
        powerRating: awayOut.tpr,
        powerRatingMeta: {
          modelVersion: 'OLS_TPR_V2',
          kind,
          components: awayOut.components,
          matchId,
        } as Prisma.InputJsonValue,
        powerRatingAt: now,
      },
    });

    const olsFactor = {
      modelVersion: 'OLS_TPR_V2',
      kind,
      homeBaseTpr: homeOut.tpr,
      awayBaseTpr: awayOut.tpr,
      homeMatchPower,
      awayMatchPower,
      homeComponents: homeOut.components,
      awayComponents: awayOut.components,
      playersRated: homePprList.length + awayPprList.length,
    };

    return {
      homeBaseTpr: homeOut.tpr,
      awayBaseTpr: awayOut.tpr,
      homeMatchPower,
      awayMatchPower,
      olsFactor,
    };
  }
}

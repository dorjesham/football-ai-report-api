import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataQuality, DataSourceType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { leagueIdForCode } from './api-football.constants';
import {
  parseAfFixtureIdFromExternalId,
  parseAfPlayerIdFromExternalId,
  parseAfTeamIdFromExternalId,
} from './af-fixture-match-fields.util';
import {
  computeFatigueIndex,
  computeInjuryImpact,
  extractFormationFromAfLineups,
  mapPlayerSeasonStats,
  mapStandingsRow,
  mapTeamStatistics,
} from './af-pre-match-mapper.util';
import { sha256StableJson } from '../common/utils/stable-content-hash.util';
import {
  mapTeamRecentFixtures,
  mergePreMatchUiFacts,
} from './af-recent-fixtures.mapper';
import {
  normalizeInjuriesResponse,
  splitInjuriesBySide,
} from '../matches/af-injuries.mapper';
import { MatchIntelFreshnessService } from '../match-intel/match-intel-freshness.service';
import { ApiFootballService } from './api-football.service';

export type PreMatchSnapshotPhase = 'T24' | 'T1';

export type MatchAfPreMatchSyncResult = {
  fixtureId: number;
  teamSnapshots: number;
  playerSnapshots: number;
  warnings: string[];
  detail: Record<string, unknown>;
};

@Injectable()
export class MatchAfPreMatchSnapshotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly api: ApiFootballService,
    private readonly intelFreshness: MatchIntelFreshnessService,
  ) {}

  async syncByMatchId(
    matchId: string,
    opts?: {
      delayMs?: number;
      force?: boolean;
      phase?: PreMatchSnapshotPhase;
      maxPlayersPerTeam?: number;
    },
  ): Promise<MatchAfPreMatchSyncResult> {
    const delay = Math.min(10_000, Math.max(0, opts?.delayMs ?? 400));
    const maxPlayers = Math.min(40, Math.max(1, opts?.maxPlayersPerTeam ?? 25));
    const warnings: string[] = [];

    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        competition: true,
        season: true,
        homeTeam: true,
        awayTeam: true,
      },
    });
    if (!match) throw new NotFoundException('Match not found');

    const fixtureId = parseAfFixtureIdFromExternalId(match.externalId);
    if (fixtureId == null) {
      throw new BadRequestException('Match.externalId 须为 af-f-{fixtureId}');
    }

    const code = match.competition?.code?.toUpperCase();
    const leagueId = code ? leagueIdForCode(code) : undefined;
    if (leagueId == null) {
      throw new BadRequestException(`赛事实例 code=${code ?? '?'} 无 API-Football league 映射`);
    }

    const seasonYear =
      match.season?.year ??
      (match.season?.code ? parseInt(match.season.code.replace(/\D/g, '').slice(0, 4), 10) : NaN) ??
      new Date(match.kickoffTime).getUTCFullYear();
    if (!Number.isFinite(seasonYear)) {
      warnings.push('无法解析 AF season，使用开球 UTC 年');
    }
    const season = Number.isFinite(seasonYear) ? seasonYear : new Date(match.kickoffTime).getUTCFullYear();

    const phase = opts?.phase;
    if (phase && !opts?.force) {
      const cursor =
        phase === 'T24' ? match.afPreMatchSnapshot24At : match.afPreMatchSnapshot1At;
      if (cursor && match.kickoffTime.getTime() > Date.now()) {
        const existing = await this.prisma.teamMatchSnapshot.count({
          where: { matchId, dataSource: DataSourceType.API_FOOTBALL },
        });
        if (existing >= 2) {
          return {
            fixtureId,
            teamSnapshots: existing,
            playerSnapshots: 0,
            warnings: ['skipped: phase cursor set and team snapshots present'],
            detail: { skipped: true, phase },
          };
        }
      }
    }

    const homeApiId = parseAfTeamIdFromExternalId(match.homeTeam.externalId);
    const awayApiId = parseAfTeamIdFromExternalId(match.awayTeam.externalId);
    if (homeApiId == null) warnings.push('主队无 af-t-* externalId');
    if (awayApiId == null) warnings.push('客队无 af-t-* externalId');

    const factsRow = await this.prisma.matchFacts.findUnique({
      where: { matchId },
      select: { lineups: true },
    });
    const homeFormation =
      homeApiId != null ?
        extractFormationFromAfLineups(factsRow?.lineups, homeApiId)
      : null;
    const awayFormation =
      awayApiId != null ?
        extractFormationFromAfLineups(factsRow?.lineups, awayApiId)
      : null;

    const standingsPack = await this.api.getStandings(leagueId, season);
    if (delay > 0) await this.api.sleep(delay);

    let homeStats = mapTeamStatistics(null);
    let awayStats = mapTeamStatistics(null);
    if (homeApiId != null) {
      const hs = await this.api.getTeamStatistics({
        teamId: homeApiId,
        league: leagueId,
        season,
      });
      homeStats = mapTeamStatistics(hs.statistics);
      if (delay > 0) await this.api.sleep(delay);
    }
    if (awayApiId != null) {
      const as = await this.api.getTeamStatistics({
        teamId: awayApiId,
        league: leagueId,
        season,
      });
      awayStats = mapTeamStatistics(as.statistics);
      if (delay > 0) await this.api.sleep(delay);
    }

    const injPack = await this.api.getInjuries({ fixture: fixtureId });
    const allInjuries = injPack.response;
    if (delay > 0) await this.api.sleep(delay);

    const homeRecent =
      homeApiId != null ?
        await this.api.getTeamRecentFixtures(homeApiId, 10)
      : { response: [] as unknown[] };
    if (delay > 0) await this.api.sleep(delay);
    const awayRecent =
      awayApiId != null ?
        await this.api.getTeamRecentFixtures(awayApiId, 10)
      : { response: [] as unknown[] };

    const homeStandings =
      homeApiId != null ? mapStandingsRow(standingsPack.response, homeApiId) : { leagueRank: null, points: null };
    const awayStandings =
      awayApiId != null ? mapStandingsRow(standingsPack.response, awayApiId) : { leagueRank: null, points: null };

    const homeInjuries = allInjuries.filter((row) => {
      const t = (row as Record<string, unknown>)?.team as Record<string, unknown> | undefined;
      return Number(t?.id) === homeApiId;
    });
    const awayInjuries = allInjuries.filter((row) => {
      const t = (row as Record<string, unknown>)?.team as Record<string, unknown> | undefined;
      return Number(t?.id) === awayApiId;
    });

    const upsertTeam = async (
      teamId: string,
      isHome: boolean,
      standings: { leagueRank: number | null; points: number | null },
      stats: ReturnType<typeof mapTeamStatistics>,
      injuries: unknown[],
      recentFx: unknown[],
      formation: string | null,
    ) => {
      const snapPayload = {
        leagueRank: standings.leagueRank,
        recentForm: stats.recentForm,
        attackRating: stats.attackRating,
        defenseRating: stats.defenseRating,
        goalsForAvg: stats.goalsForAvg,
        goalsAgainstAvg: stats.goalsAgainstAvg,
      };
      const contentHash = sha256StableJson(snapPayload);
      await this.prisma.teamMatchSnapshot.upsert({
        where: { matchId_teamId: { matchId, teamId } },
        create: {
          matchId,
          teamId,
          isHome,
          formation: formation ?? undefined,
          leagueRank: standings.leagueRank ?? undefined,
          points: standings.points ?? undefined,
          recentForm: stats.recentForm ?? undefined,
          goalsForAvg: stats.goalsForAvg ?? undefined,
          goalsAgainstAvg: stats.goalsAgainstAvg ?? undefined,
          attackRating: stats.attackRating ?? undefined,
          defenseRating: stats.defenseRating ?? undefined,
          contentHash,
          injuryImpact: computeInjuryImpact(injuries),
          fatigueIndex: computeFatigueIndex(recentFx),
          dataQuality: DataQuality.PUBLIC_DATA,
          dataSource: DataSourceType.API_FOOTBALL,
        },
        update: {
          formation: formation ?? undefined,
          leagueRank: standings.leagueRank ?? undefined,
          points: standings.points ?? undefined,
          recentForm: stats.recentForm ?? undefined,
          goalsForAvg: stats.goalsForAvg ?? undefined,
          goalsAgainstAvg: stats.goalsAgainstAvg ?? undefined,
          attackRating: stats.attackRating ?? undefined,
          defenseRating: stats.defenseRating ?? undefined,
          contentHash,
          injuryImpact: computeInjuryImpact(injuries),
          fatigueIndex: computeFatigueIndex(recentFx),
          dataQuality: DataQuality.PUBLIC_DATA,
          dataSource: DataSourceType.API_FOOTBALL,
        },
      });
    };

    await upsertTeam(
      match.homeTeamId,
      true,
      homeStandings,
      homeStats,
      homeInjuries,
      homeRecent.response,
      homeFormation,
    );
    await upsertTeam(
      match.awayTeamId,
      false,
      awayStandings,
      awayStats,
      awayInjuries,
      awayRecent.response,
      awayFormation,
    );

    const homeFormMatches =
      homeApiId != null ?
        mapTeamRecentFixtures(
          homeRecent.response,
          homeApiId,
          match.homeTeam.nameCn,
          5,
        )
      : [];
    const awayFormMatches =
      awayApiId != null ?
        mapTeamRecentFixtures(
          awayRecent.response,
          awayApiId,
          match.awayTeam.nameCn,
          5,
        )
      : [];

    const injuryRows = normalizeInjuriesResponse(allInjuries);
    const { homeInjuries: injHome, awayInjuries: injAway } = splitInjuriesBySide(
      injuryRows,
      homeApiId,
      awayApiId,
    );

    const existingFacts = await this.prisma.matchFacts.findUnique({
      where: { matchId },
      select: { supplementaryFacts: true },
    });
    const supplementaryFacts = mergePreMatchUiFacts(
      existingFacts?.supplementaryFacts,
      {
        recentForm: {
          home: { form: homeStats.recentForm, matches: homeFormMatches },
          away: { form: awayStats.recentForm, matches: awayFormMatches },
        },
      },
    );

    await this.prisma.matchFacts.upsert({
      where: { matchId },
      create: {
        matchId,
        supplementaryFacts: supplementaryFacts as Prisma.InputJsonValue,
        injuriesJson: {
          homeInjuries: injHome,
          awayInjuries: injAway,
          items: [...injHome, ...injAway],
        } as Prisma.InputJsonValue,
        primaryProvider: DataSourceType.API_FOOTBALL,
      },
      update: {
        supplementaryFacts: supplementaryFacts as Prisma.InputJsonValue,
        injuriesJson: {
          homeInjuries: injHome,
          awayInjuries: injAway,
          items: [...injHome, ...injAway],
        } as Prisma.InputJsonValue,
        lastSyncedAt: new Date(),
      },
    });

    let playerCount = 0;
    for (const side of [
      { apiId: homeApiId, teamId: match.homeTeamId },
      { apiId: awayApiId, teamId: match.awayTeamId },
    ]) {
      if (side.apiId == null) continue;
      const dbPlayers = await this.prisma.player.findMany({
        where: { teamId: side.teamId, externalId: { startsWith: 'af-p-' } },
        take: maxPlayers,
        select: { id: true, externalId: true },
      });
      if (dbPlayers.length === 0) {
        warnings.push(`team ${side.teamId}: 无 af-p-* 球员，跳过球员快照`);
        continue;
      }
      const apiPlayerIds = new Set(
        dbPlayers
          .map((p) => parseAfPlayerIdFromExternalId(p.externalId))
          .filter((n): n is number => n != null),
      );
      let page = 1;
      let totalPages = 1;
      while (page <= totalPages && page <= 3) {
        const pack = await this.api.getPlayersByTeam(side.apiId, season, { page });
        totalPages = pack.paging.total;
        for (const row of pack.items) {
          const root = row as Record<string, unknown>;
          const playerNode = (root?.player ?? root) as Record<string, unknown>;
          const pid = Number(playerNode?.id);
          if (!apiPlayerIds.has(pid)) continue;
          const dbP = dbPlayers.find(
            (p) => parseAfPlayerIdFromExternalId(p.externalId) === pid,
          );
          if (!dbP) continue;
          const mapped = mapPlayerSeasonStats(row);
          await this.prisma.playerMatchSnapshot.upsert({
            where: { matchId_playerId: { matchId, playerId: dbP.id } },
            create: {
              matchId,
              playerId: dbP.id,
              teamId: side.teamId,
              formScore: mapped.formScore ?? undefined,
              last5Goals: mapped.last5Goals ?? undefined,
              last5Assists: mapped.last5Assists ?? undefined,
              avgMinutes: mapped.avgMinutes ?? undefined,
              dataQuality: DataQuality.PUBLIC_DATA,
              dataSource: DataSourceType.API_FOOTBALL,
            },
            update: {
              formScore: mapped.formScore ?? undefined,
              last5Goals: mapped.last5Goals ?? undefined,
              last5Assists: mapped.last5Assists ?? undefined,
              avgMinutes: mapped.avgMinutes ?? undefined,
              dataQuality: DataQuality.PUBLIC_DATA,
              dataSource: DataSourceType.API_FOOTBALL,
            },
          });
          playerCount += 1;
        }
        page += 1;
        if (delay > 0) await this.api.sleep(delay);
      }
    }

    const now = new Date();
    const matchUpdate: Prisma.MatchUpdateInput = {};
    if (phase === 'T24') matchUpdate.afPreMatchSnapshot24At = now;
    if (phase === 'T1') matchUpdate.afPreMatchSnapshot1At = now;
    if (Object.keys(matchUpdate).length > 0) {
      await this.prisma.match.update({ where: { id: matchId }, data: matchUpdate });
    }

    await this.intelFreshness.refreshIntelContentHash(matchId);

    return {
      fixtureId,
      teamSnapshots: 2,
      playerSnapshots: playerCount,
      warnings,
      detail: {
        leagueId,
        season,
        injuriesCount: allInjuries.length,
        standingsGroups: standingsPack.response.length,
      },
    };
  }
}

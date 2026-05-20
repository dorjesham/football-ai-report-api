import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiFootballService } from '../api-football/api-football.service';
import { leagueIdForCode } from '../api-football/api-football.constants';
import {
  DEFAULT_LEADERBOARD_CODES,
  LEAGUE_CODE_TO_COMPETITION_ID,
} from '../leagues/league-code.constants';
import { normalizeTopscorersResponse } from '../rankings/rankings-af-fallback.util';

@Injectable()
export class TopscorersMaterializeService {
  private readonly log = new Logger(TopscorersMaterializeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly apiFootball: ApiFootballService,
  ) {}

  async syncAll(coreSeasonYear: number, wcSeasonYear = 2026) {
    const out: Record<string, unknown> = {};
    for (const code of DEFAULT_LEADERBOARD_CODES) {
      const season = code === 'WC' ? wcSeasonYear : coreSeasonYear;
      out[code] = await this.syncCode(code, season);
    }
    return out;
  }

  async syncCode(code: string, seasonYear: number) {
    const upper = code.toUpperCase();
    const competitionId = LEAGUE_CODE_TO_COMPETITION_ID[upper];
    const leagueId = leagueIdForCode(upper);
    if (!competitionId || leagueId == null) {
      return { skipped: true, reason: 'unknown code' };
    }
    const pack = await this.apiFootball.getTopscorers(leagueId, seasonYear);
    const rows = normalizeTopscorersResponse(pack.response, 'goals');
    let goalsUpserted = 0;
    let assistsUpserted = 0;
    let skippedPlayers = 0;

    for (const r of rows) {
      if (!r.playerId) {
        skippedPlayers++;
        continue;
      }
      const player = await this.prisma.player.findFirst({
        where: { externalId: r.playerId },
      });
      if (!player) {
        skippedPlayers++;
        continue;
      }
      let teamId: string | null = player.teamId;
      if (r.apiTeamId != null) {
        const statsTeam = await this.prisma.team.findFirst({
          where: { externalId: `af-t-${r.apiTeamId}` },
          select: { id: true },
        });
        if (statsTeam) teamId = statsTeam.id;
      }

      const extra = {
        nameCn: r.nameCn,
        nameEn: r.nameEn,
        avatarUrl: r.avatarUrl,
        teamName: r.teamName,
        teamLogo: r.teamLogo,
        position: r.position,
      };

      if (r.goals != null) {
        await this.prisma.playerSeasonMetric.upsert({
          where: {
            competitionId_seasonYear_playerId_metric: {
              competitionId,
              seasonYear,
              playerId: player.id,
              metric: 'goals',
            },
          },
          create: {
            competitionId,
            seasonYear,
            playerId: player.id,
            teamId,
            metric: 'goals',
            value: r.goals,
            rank: r.rank,
            goals: r.goals,
            assists: r.assists,
            extra,
          },
          update: {
            value: r.goals,
            rank: r.rank,
            goals: r.goals,
            assists: r.assists,
            teamId,
            extra,
            syncedAt: new Date(),
          },
        });
        goalsUpserted++;
      }

      if (r.assists != null && r.assists > 0) {
        await this.prisma.playerSeasonMetric.upsert({
          where: {
            competitionId_seasonYear_playerId_metric: {
              competitionId,
              seasonYear,
              playerId: player.id,
              metric: 'assists',
            },
          },
          create: {
            competitionId,
            seasonYear,
            playerId: player.id,
            teamId,
            metric: 'assists',
            value: r.assists,
            rank: r.rank,
            goals: r.goals,
            assists: r.assists,
            extra,
          },
          update: {
            value: r.assists,
            rank: r.rank,
            goals: r.goals,
            assists: r.assists,
            teamId,
            extra,
            syncedAt: new Date(),
          },
        });
        assistsUpserted++;
      }
    }

    return {
      apiRows: rows.length,
      goalsUpserted,
      assistsUpserted,
      skippedPlayers,
    };
  }

  /** WC bootstrap: topscorers + topassists + card leaderboards */
  async syncWcLeaderboardsFull(code: string, seasonYear: number) {
    const upper = code.toUpperCase();
    const competitionId = LEAGUE_CODE_TO_COMPETITION_ID[upper];
    const leagueId = leagueIdForCode(upper);
    if (!competitionId || leagueId == null) {
      return { skipped: true, reason: 'unknown code' };
    }
    const goals = await this.syncCode(code, seasonYear);
    const assists = await this.syncMetricLeaderboard(
      competitionId,
      leagueId,
      seasonYear,
      'assists',
      (lid, yr) => this.apiFootball.getTopAssists(lid, yr),
    );
    const yellow = await this.syncMetricLeaderboard(
      competitionId,
      leagueId,
      seasonYear,
      'yellow_cards',
      (lid, yr) => this.apiFootball.getTopYellowCards(lid, yr),
    );
    const red = await this.syncMetricLeaderboard(
      competitionId,
      leagueId,
      seasonYear,
      'red_cards',
      (lid, yr) => this.apiFootball.getTopRedCards(lid, yr),
    );
    return { goals, assists, yellow, red };
  }

  private async syncMetricLeaderboard(
    competitionId: string,
    leagueId: number,
    seasonYear: number,
    metric: string,
    fetch: (
      leagueId: number,
      season: number,
    ) => Promise<{ response: unknown[] }>,
  ) {
    const pack = await fetch(leagueId, seasonYear);
    const rows = normalizeTopscorersResponse(pack.response, 'goals');
    let upserted = 0;
    let skipped = 0;
    for (const r of rows) {
      if (!r.playerId) {
        skipped += 1;
        continue;
      }
      const player = await this.prisma.player.findFirst({
        where: { externalId: r.playerId },
      });
      if (!player) {
        skipped += 1;
        continue;
      }
      const value = r.goals ?? r.metricValue ?? 0;
      await this.prisma.playerSeasonMetric.upsert({
        where: {
          competitionId_seasonYear_playerId_metric: {
            competitionId,
            seasonYear,
            playerId: player.id,
            metric,
          },
        },
        create: {
          competitionId,
          seasonYear,
          playerId: player.id,
          teamId: player.teamId,
          metric,
          value,
          rank: r.rank,
          extra: { nameEn: r.nameEn, teamName: r.teamName } as Prisma.InputJsonValue,
        },
        update: {
          value,
          rank: r.rank,
          syncedAt: new Date(),
        },
      });
      upserted += 1;
    }
    return { apiRows: rows.length, upserted, skipped, metric };
  }
}

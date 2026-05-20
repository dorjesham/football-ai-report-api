import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiFootballService } from '../api-football/api-football.service';
import { leagueIdForCode } from '../api-football/api-football.constants';
import { normalizeApiFootballStandingsGroups } from '../leagues/af-standings.mapper';
import {
  DEFAULT_STANDINGS_CODES,
  LEAGUE_CODE_TO_COMPETITION_ID,
} from '../leagues/league-code.constants';

@Injectable()
export class StandingsMaterializeService {
  private readonly log = new Logger(StandingsMaterializeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly apiFootball: ApiFootballService,
  ) {}

  async syncAll(coreSeasonYear: number, wcSeasonYear = 2026) {
    const coreCodes = DEFAULT_STANDINGS_CODES.filter((c) => c !== 'WC');
    const core = await this.syncCodes(coreSeasonYear, [...coreCodes]);
    const wc = await this.syncCode('WC', wcSeasonYear);
    return { core, wc };
  }

  async syncCodes(seasonYear: number, codes = [...DEFAULT_STANDINGS_CODES]) {
    const out: Record<string, unknown> = {};
    for (const code of codes) {
      out[code] = await this.syncCode(code, seasonYear);
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
    const pack = await this.apiFootball.getStandings(leagueId, seasonYear);
    const groups = normalizeApiFootballStandingsGroups(pack.response);
    let upserted = 0;
    let skippedTeams = 0;
    for (const group of groups) {
      for (const r of group.rows) {
        const apiTeamId = typeof r.teamId === 'number' ? r.teamId : Number(r.teamId);
        if (!Number.isFinite(apiTeamId)) continue;
        const team = await this.prisma.team.findFirst({
          where: { externalId: `af-t-${apiTeamId}` },
        });
        if (!team) {
          skippedTeams++;
          this.log.warn(`Standing row skipped: no af-t-${apiTeamId} for ${upper}`);
          continue;
        }
        await this.prisma.competitionStanding.upsert({
          where: {
            competitionId_seasonYear_teamId_groupName: {
              competitionId,
              seasonYear,
              teamId: team.id,
              groupName: group.groupName,
            },
          },
          create: {
            competitionId,
            seasonYear,
            teamId: team.id,
            groupName: group.groupName,
            rank: r.rank,
            points: r.points,
            played: r.played,
            won: r.wins,
            draw: r.draws,
            lost: r.losses,
            goalsFor: r.goalsFor,
            goalsAgainst: r.goalsAgainst,
            goalDiff: r.goalDifference,
            form: null,
            extra: { teamName: r.teamName, teamLogo: r.teamLogo },
          },
          update: {
            rank: r.rank,
            points: r.points,
            played: r.played,
            won: r.wins,
            draw: r.draws,
            lost: r.losses,
            goalsFor: r.goalsFor,
            goalsAgainst: r.goalsAgainst,
            goalDiff: r.goalDifference,
            extra: { teamName: r.teamName, teamLogo: r.teamLogo },
            syncedAt: new Date(),
          },
        });
        upserted++;
      }
    }
    return {
      upserted,
      groups: groups.length,
      apiRows: groups.reduce((n, g) => n + g.rows.length, 0),
      skippedTeams,
    };
  }
}

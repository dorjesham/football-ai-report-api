import { Injectable } from '@nestjs/common';
import { AfCatalogSyncService } from '../api-football/af-catalog-sync.service';
import { ApiFootballService } from '../api-football/api-football.service';
import { leagueIdForCode } from '../api-football/api-football.constants';
import { MatchOddsLiveSyncService } from '../api-football/match-odds-live-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { WORLD_CUP_COMPETITION_CODE, WORLD_CUP_DEFAULT_SEASON } from './world-cup-match.util';

@Injectable()
export class WorldCupExtendedSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly api: ApiFootballService,
    private readonly catalog: AfCatalogSyncService,
    private readonly oddsLive: MatchOddsLiveSyncService,
  ) {}

  async syncFixtureRounds(season = WORLD_CUP_DEFAULT_SEASON) {
    const leagueId = leagueIdForCode(WORLD_CUP_COMPETITION_CODE);
    if (leagueId == null) return { skipped: true };
    const pack = await this.api.getFixtureRounds(leagueId, season);
    const comp = await this.prisma.competition.findFirst({
      where: { code: WORLD_CUP_COMPETITION_CODE },
    });
    if (!comp) return { skipped: true };
    return { rounds: pack.response.length, season, sample: pack.response.slice(0, 5) };
  }

  async syncTeamCatalogExtras(maxTeams = 20) {
    const teams = await this.prisma.team.findMany({
      where: { externalId: { startsWith: 'af-t-' } },
      take: maxTeams,
    });
    let trophies = 0;
    let sidelined = 0;
    for (const t of teams) {
      try {
        await this.catalog.syncTeamCatalog(t.id, WORLD_CUP_DEFAULT_SEASON);
        trophies += 1;
      } catch {
        /* quota */
      }
    }
    return { teams: teams.length, trophies, sidelined };
  }

  async syncOddsLiveForMatch(matchId: string) {
    return this.oddsLive.captureLiveOddsForMatch(matchId);
  }
}

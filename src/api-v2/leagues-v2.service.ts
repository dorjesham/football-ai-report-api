import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type LeaderboardField =
  | 'topscorersJson'
  | 'topAssistsJson'
  | 'topYellowCardsJson'
  | 'topRedCardsJson';

@Injectable()
export class LeaguesV2Service {
  constructor(private readonly prisma: PrismaService) {}

  private async getCacheRow(code: string, season: number) {
    const row = await this.prisma.leagueAfCache.findUnique({
      where: { competitionCode_season: { competitionCode: code, season } },
    });
    if (!row) throw new NotFoundException(`League cache not found for ${code} season ${season}`);
    return row;
  }

  async standings(code: string, season = 2025) {
    const row = await this.getCacheRow(code, season);
    return {
      schema: 'league-standings-v2' as const,
      competitionCode: code,
      season,
      source: 'api-football' as const,
      data: row.standingsJson ?? [],
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private leaderboard(code: string, field: LeaderboardField, season = 2025) {
    return this.getCacheRow(code, season).then((row) => ({
      schema: 'league-leaderboard-v2' as const,
      competitionCode: code,
      season,
      field,
      source: 'api-football' as const,
      data: (row[field] as unknown) ?? [],
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  topscorers(code: string, season?: number) {
    return this.leaderboard(code, 'topscorersJson', season);
  }

  topassists(code: string, season?: number) {
    return this.leaderboard(code, 'topAssistsJson', season);
  }

  topyellowcards(code: string, season?: number) {
    return this.leaderboard(code, 'topYellowCardsJson', season);
  }

  topredcards(code: string, season?: number) {
    return this.leaderboard(code, 'topRedCardsJson', season);
  }

  async rounds(code: string, season = 2025) {
    const row = await this.getCacheRow(code, season);
    return {
      schema: 'league-rounds-v2' as const,
      competitionCode: code,
      season,
      data: row.fixtureRoundsJson ?? [],
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

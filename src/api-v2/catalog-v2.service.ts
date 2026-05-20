import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CatalogV2Service {
  constructor(private readonly prisma: PrismaService) {}

  async teamTransfers(teamId: string, season?: number) {
    const seasonYear = season ?? new Date().getFullYear();
    const row = await this.prisma.afTransferRaw.findUnique({
      where: { teamId_season: { teamId, season: seasonYear } },
    });
    if (!row) throw new NotFoundException('Transfers not synced for this team/season');
    return {
      schema: 'team-transfers-v2' as const,
      teamId,
      season: seasonYear,
      source: 'api-football' as const,
      data: row.payloadJson,
      syncedAt: row.syncedAt?.toISOString() ?? null,
    };
  }

  async teamTrophies(teamId: string) {
    const row = await this.prisma.afTrophyRaw.findUnique({ where: { teamId } });
    if (!row) throw new NotFoundException('Team trophies not synced');
    return {
      schema: 'team-trophies-v2' as const,
      teamId,
      source: 'api-football' as const,
      data: row.payloadJson,
      syncedAt: row.syncedAt?.toISOString() ?? null,
    };
  }

  async playerTrophies(playerId: string) {
    const row = await this.prisma.afTrophyRaw.findUnique({ where: { playerId } });
    if (!row) throw new NotFoundException('Player trophies not synced');
    return {
      schema: 'player-trophies-v2' as const,
      playerId,
      source: 'api-football' as const,
      data: row.payloadJson,
      syncedAt: row.syncedAt?.toISOString() ?? null,
    };
  }

  async playerSidelined(playerId: string) {
    const row = await this.prisma.afSidelinedRaw.findUnique({ where: { playerId } });
    if (!row) throw new NotFoundException('Player sidelined not synced');
    return {
      schema: 'player-sidelined-v2' as const,
      playerId,
      source: 'api-football' as const,
      data: row.payloadJson,
      syncedAt: row.syncedAt?.toISOString() ?? null,
    };
  }
}

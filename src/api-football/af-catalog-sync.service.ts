import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { parseAfTeamIdFromExternalId } from './af-fixture-match-fields.util';
import { ApiFootballService } from './api-football.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AfCatalogSyncService {
  private readonly log = new Logger(AfCatalogSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly api: ApiFootballService,
    private readonly config: ConfigService,
  ) {}

  private parsePlayerApiId(externalId: string | null): number | null {
    if (!externalId) return null;
    const m = /^af-p-(\d+)$/i.exec(externalId.trim());
    return m ? parseInt(m[1], 10) : null;
  }

  async syncTeamCatalog(teamId: string, season?: number) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, externalId: true },
    });
    if (!team) throw new NotFoundException('Team not found');
    const apiTeamId = parseAfTeamIdFromExternalId(team.externalId);
    if (apiTeamId == null) {
      throw new NotFoundException('Team.externalId must be af-t-{id}');
    }
    const seasonYear = season ?? this.config.get<number>('afSyncSeason') ?? 2025;
    const now = new Date();

    const transfers = await this.api.getTransfers(apiTeamId, seasonYear);
    await this.prisma.afTransferRaw.upsert({
      where: { teamId_season: { teamId, season: seasonYear } },
      create: {
        teamId,
        apiTeamId,
        season: seasonYear,
        payloadJson: transfers.response as Prisma.InputJsonValue,
        syncedAt: now,
      },
      update: {
        payloadJson: transfers.response as Prisma.InputJsonValue,
        syncedAt: now,
      },
    });

    const trophies = await this.api.getTrophies({ team: apiTeamId });
    await this.prisma.afTrophyRaw.upsert({
      where: { teamId },
      create: {
        teamId,
        apiEntityId: apiTeamId,
        payloadJson: trophies.response as Prisma.InputJsonValue,
        syncedAt: now,
      },
      update: {
        payloadJson: trophies.response as Prisma.InputJsonValue,
        syncedAt: now,
      },
    });

    return {
      teamId,
      season: seasonYear,
      transferRows: transfers.response.length,
      trophyRows: trophies.response.length,
    };
  }

  async syncPlayerCatalog(playerId: string) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true, externalId: true },
    });
    if (!player) throw new NotFoundException('Player not found');
    const apiPlayerId = this.parsePlayerApiId(player.externalId);
    if (apiPlayerId == null) {
      throw new NotFoundException('Player.externalId must be af-p-{id}');
    }
    const now = new Date();

    const trophies = await this.api.getTrophies({ player: apiPlayerId });
    await this.prisma.afTrophyRaw.upsert({
      where: { playerId },
      create: {
        playerId,
        apiEntityId: apiPlayerId,
        payloadJson: trophies.response as Prisma.InputJsonValue,
        syncedAt: now,
      },
      update: {
        payloadJson: trophies.response as Prisma.InputJsonValue,
        syncedAt: now,
      },
    });

    const sidelined = await this.api.getSidelined(apiPlayerId);
    await this.prisma.afSidelinedRaw.upsert({
      where: { playerId },
      create: {
        playerId,
        apiPlayerId,
        payloadJson: sidelined.response as Prisma.InputJsonValue,
        syncedAt: now,
      },
      update: {
        payloadJson: sidelined.response as Prisma.InputJsonValue,
        syncedAt: now,
      },
    });

    return {
      playerId,
      trophyRows: trophies.response.length,
      sidelinedRows: sidelined.response.length,
    };
  }

  /** 低优先级：有 af-t-* 的球队批量同步转会（限量） */
  async syncTransfersBatch(opts?: { maxTeams?: number; season?: number }) {
    if (this.config.get<boolean>('enableAfCatalogSync') !== true) {
      return { skipped: true, reason: 'ENABLE_AF_CATALOG_SYNC=false' };
    }
    const seasonYear = opts?.season ?? this.config.get<number>('afSyncSeason') ?? 2025;
    const max = Math.min(50, opts?.maxTeams ?? 10);
    const teams = await this.prisma.team.findMany({
      where: { externalId: { startsWith: 'af-t-' } },
      take: max,
      select: { id: true },
    });
    let ok = 0;
    for (const t of teams) {
      try {
        await this.syncTeamCatalog(t.id, seasonYear);
        ok++;
      } catch (e) {
        this.log.warn(`syncTeamCatalog ${t.id}: ${String(e).slice(0, 80)}`);
      }
    }
    return { attempted: teams.length, ok, season: seasonYear };
  }
}

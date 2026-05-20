import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AfAvailabilityStatus } from '../match-af-raw-bundle/af-availability.util';
import { AfCatalogSyncService } from '../api-football/af-catalog-sync.service';
import { AfSyncOrchestrator } from '../api-football/af-sync-orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';

export function jsonArrayStatus(value: unknown): AfAvailabilityStatus {
  if (value == null) return 'missing';
  if (!Array.isArray(value)) {
    if (typeof value === 'object' && Object.keys(value as object).length > 0) {
      return 'present';
    }
    return value === null ? 'missing' : 'empty';
  }
  return value.length > 0 ? 'present' : 'empty';
}

export type LeagueB2Fields = {
  standings: AfAvailabilityStatus;
  topAssists: AfAvailabilityStatus;
  topYellowCards: AfAvailabilityStatus;
  topRedCards: AfAvailabilityStatus;
  fixtureRounds: AfAvailabilityStatus;
  topscorers: AfAvailabilityStatus;
};

@Injectable()
export class AdminAfCatalogOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly afSync: AfSyncOrchestrator,
    private readonly afCatalog: AfCatalogSyncService,
  ) {}

  defaultSeason(): number {
    return this.config.get<number>('afSyncSeason') ?? 2025;
  }

  mapLeagueCacheFields(cache: {
    standingsJson: unknown;
    topAssistsJson: unknown;
    topYellowCardsJson: unknown;
    topRedCardsJson: unknown;
    fixtureRoundsJson: unknown;
    topscorersJson: unknown;
  } | null): LeagueB2Fields {
    if (!cache) {
      return {
        standings: 'missing',
        topAssists: 'missing',
        topYellowCards: 'missing',
        topRedCards: 'missing',
        fixtureRounds: 'missing',
        topscorers: 'missing',
      };
    }
    return {
      standings: jsonArrayStatus(cache.standingsJson),
      topAssists: jsonArrayStatus(cache.topAssistsJson),
      topYellowCards: jsonArrayStatus(cache.topYellowCardsJson),
      topRedCards: jsonArrayStatus(cache.topRedCardsJson),
      fixtureRounds: jsonArrayStatus(cache.fixtureRoundsJson),
      topscorers: jsonArrayStatus(cache.topscorersJson),
    };
  }

  async listLeaguesCatalog(season?: number) {
    const seasonYear = season ?? this.defaultSeason();
    const competitions = await this.prisma.competition.findMany({
      where: { externalId: { startsWith: 'af-l-' } },
      select: { code: true, nameCn: true, externalId: true },
      orderBy: { code: 'asc' },
      take: 100,
    });
    const caches = await this.prisma.leagueAfCache.findMany({
      where: { season: seasonYear },
    });
    const byCode = new Map(caches.map((c) => [c.competitionCode, c]));

    return {
      season: seasonYear,
      items: competitions.map((c) => {
        const cache = c.code ? byCode.get(c.code) : undefined;
        return {
          code: c.code,
          nameCn: c.nameCn,
          externalId: c.externalId,
          syncedAt: cache?.updatedAt?.toISOString() ?? null,
          fields: this.mapLeagueCacheFields(cache ?? null),
        };
      }),
    };
  }

  syncLeagueCatalog(code: string, season?: number) {
    const seasonYear = season ?? this.defaultSeason();
    return this.afSync.syncLeagueCatalog(code, seasonYear);
  }

  async listAfTeams(opts?: { take?: number; q?: string }) {
    const take = Math.min(100, opts?.take ?? 50);
    const q = opts?.q?.trim();
    const teams = await this.prisma.team.findMany({
      where: {
        externalId: { startsWith: 'af-t-' },
        ...(q ?
          {
            OR: [
              { nameCn: { contains: q } },
              { id: { contains: q } },
            ],
          }
        : {}),
      },
      select: { id: true, nameCn: true, externalId: true },
      orderBy: { nameCn: 'asc' },
      take,
    });
    return { items: teams };
  }

  async getTeamCatalog(teamId: string, season?: number) {
    const seasonYear = season ?? this.defaultSeason();
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, nameCn: true, externalId: true },
    });
    if (!team) throw new NotFoundException('Team not found');

    const [transfer, trophy] = await Promise.all([
      this.prisma.afTransferRaw.findUnique({
        where: { teamId_season: { teamId, season: seasonYear } },
      }),
      this.prisma.afTrophyRaw.findUnique({ where: { teamId } }),
    ]);

    return {
      teamId,
      nameCn: team.nameCn,
      externalId: team.externalId,
      season: seasonYear,
      transfers: {
        status: transfer ? jsonArrayStatus(transfer.payloadJson) : 'missing',
        syncedAt: transfer?.syncedAt?.toISOString() ?? null,
      },
      trophies: {
        status: trophy ? jsonArrayStatus(trophy.payloadJson) : 'missing',
        syncedAt: trophy?.syncedAt?.toISOString() ?? null,
      },
    };
  }

  async listAfPlayers(opts?: { take?: number; q?: string }) {
    const take = Math.min(100, opts?.take ?? 50);
    const q = opts?.q?.trim();
    const players = await this.prisma.player.findMany({
      where: {
        externalId: { startsWith: 'af-p-' },
        ...(q ?
          {
            OR: [
              { nameCn: { contains: q } },
              { id: { contains: q } },
            ],
          }
        : {}),
      },
      select: { id: true, nameCn: true, externalId: true },
      orderBy: { nameCn: 'asc' },
      take,
    });
    return { items: players };
  }

  async getPlayerCatalog(playerId: string) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true, nameCn: true, externalId: true },
    });
    if (!player) throw new NotFoundException('Player not found');

    const [trophy, sidelined] = await Promise.all([
      this.prisma.afTrophyRaw.findUnique({ where: { playerId } }),
      this.prisma.afSidelinedRaw.findUnique({ where: { playerId } }),
    ]);

    return {
      playerId,
      nameCn: player.nameCn,
      externalId: player.externalId,
      trophies: {
        status: trophy ? jsonArrayStatus(trophy.payloadJson) : 'missing',
        syncedAt: trophy?.syncedAt?.toISOString() ?? null,
      },
      sidelined: {
        status: sidelined ? jsonArrayStatus(sidelined.payloadJson) : 'missing',
        syncedAt: sidelined?.syncedAt?.toISOString() ?? null,
      },
    };
  }

  private async teamCatalogBrief(teamId: string, season: number) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, nameCn: true, externalId: true },
    });
    if (!team) return null;
    const catalog = await this.getTeamCatalog(teamId, season);
    return {
      teamId: team.id,
      nameCn: team.nameCn,
      externalId: team.externalId,
      transfers: catalog.transfers,
      trophies: catalog.trophies,
    };
  }

  private async playerCatalogBrief(playerId: string) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true, nameCn: true, externalId: true },
    });
    if (!player?.externalId?.startsWith('af-p-')) return null;
    const catalog = await this.getPlayerCatalog(playerId);
    return {
      playerId: player.id,
      nameCn: player.nameCn,
      externalId: player.externalId,
      trophies: catalog.trophies,
      sidelined: catalog.sidelined,
    };
  }

  async getMatchEnrichment(matchId: string) {
    const seasonYear = this.defaultSeason();
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        homeTeamId: true,
        awayTeamId: true,
        playerIntelligence: {
          take: 20,
          select: { playerId: true },
        },
      },
    });
    if (!match) throw new NotFoundException('Match not found');

    const [home, away, liveAgg, players] = await Promise.all([
      this.teamCatalogBrief(match.homeTeamId, seasonYear),
      this.teamCatalogBrief(match.awayTeamId, seasonYear),
      this.prisma.matchOddsLiveSnapshot.aggregate({
        where: { matchId },
        _count: true,
        _max: { capturedAt: true },
      }),
      Promise.all(
        [...new Set(match.playerIntelligence.map((p) => p.playerId))].map((id) =>
          this.playerCatalogBrief(id),
        ),
      ),
    ]);

    return {
      matchId,
      season: seasonYear,
      teams: { home, away },
      liveOdds: {
        count: liveAgg._count,
        lastCapturedAt: liveAgg._max.capturedAt?.toISOString() ?? null,
        status: liveAgg._count > 0 ? ('present' as const) : ('missing' as const),
      },
      players: players.filter(Boolean),
    };
  }
}

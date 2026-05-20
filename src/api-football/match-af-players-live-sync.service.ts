import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  isMatchInLiveFactsWindow,
  needsAfLivePlayersSync,
} from './match-af-facts-sync.util';
import { mapAfFixturePlayersResponse } from './af-fixture-players.mapper';
import {
  parseAfFixtureIdFromExternalId,
  parseAfTeamIdFromExternalId,
} from './af-fixture-match-fields.util';
import { ApiFootballService } from './api-football.service';
import type { LiveMetaJson } from '../match-live/live-event.types';

@Injectable()
export class MatchAfPlayersLiveSyncService {
  private readonly log = new Logger(MatchAfPlayersLiveSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly api: ApiFootballService,
  ) {}

  async syncPlayersByMatchId(
    matchId: string,
    opts?: { delayMs?: number; force?: boolean; minIntervalSec?: number },
  ): Promise<Record<string, unknown>> {
    const delay = Math.min(10_000, Math.max(0, opts?.delayMs ?? 350));
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeTeam: { select: { id: true, externalId: true } },
        awayTeam: { select: { id: true, externalId: true } },
      },
    });
    if (!match) throw new NotFoundException('Match not found');
    const fid = parseAfFixtureIdFromExternalId(match.externalId);
    if (fid == null) {
      throw new BadRequestException('Match is not af-f-* API-Football chain');
    }
    if (!isMatchInLiveFactsWindow(match)) {
      return { skipped: true, reason: 'not in live window', fixtureId: fid };
    }

    const facts = await this.prisma.matchFacts.findUnique({ where: { matchId } });
    const skip = needsAfLivePlayersSync(match, facts, {
      force: opts?.force,
      minIntervalSec: opts?.minIntervalSec,
    });
    if (!skip.needed) {
      return { skipped: true, reason: skip.reason, fixtureId: fid };
    }

    if (delay > 0) await this.api.sleep(delay);
    const pack = await this.api.getFixturePlayers(fid);
    const homeAfId = parseAfTeamIdFromExternalId(match.homeTeam.externalId);
    const awayAfId = parseAfTeamIdFromExternalId(match.awayTeam.externalId);
    const rows = mapAfFixturePlayersResponse(pack.response, homeAfId, awayAfId);

    const now = new Date();
    let upserted = 0;
    for (const row of rows) {
      const teamId =
        row.teamSide === 'home' ? match.homeTeam.id : match.awayTeam.id;
      let playerId: string | null = null;
      const existingPlayer = await this.prisma.player.findFirst({
        where: { externalId: `af-p-${row.afPlayerId}` },
        select: { id: true },
      });
      if (existingPlayer) {
        playerId = existingPlayer.id;
      } else {
        try {
          const created = await this.prisma.player.create({
            data: {
              teamId,
              externalId: `af-p-${row.afPlayerId}`,
              nameCn: row.playerName,
              nameEn: row.playerNameEn ?? row.playerName,
              position: row.position ?? undefined,
            },
          });
          playerId = created.id;
        } catch {
          const again = await this.prisma.player.findFirst({
            where: { externalId: `af-p-${row.afPlayerId}` },
            select: { id: true },
          });
          playerId = again?.id ?? null;
        }
      }

      await this.prisma.matchPlayerMatchStat.upsert({
        where: {
          matchId_afPlayerId: { matchId, afPlayerId: row.afPlayerId },
        },
        create: {
          matchId,
          afPlayerId: row.afPlayerId,
          playerId,
          teamSide: row.teamSide,
          playerName: row.playerName,
          playerNameEn: row.playerNameEn,
          position: row.position,
          minutes: row.minutes ?? undefined,
          rating: row.rating ?? undefined,
          goals: row.goals ?? undefined,
          assists: row.assists ?? undefined,
          shots: row.shots ?? undefined,
          shotsOn: row.shotsOn ?? undefined,
          passes: row.passes ?? undefined,
          keyPasses: row.keyPasses ?? undefined,
          tackles: row.tackles ?? undefined,
          duelsWon: row.duelsWon ?? undefined,
          saves: row.saves ?? undefined,
          yellowCards: row.yellowCards ?? undefined,
          redCards: row.redCards ?? undefined,
          rawJson: row.rawJson as Prisma.InputJsonValue,
          syncedAt: now,
        },
        update: {
          playerId,
          teamSide: row.teamSide,
          playerName: row.playerName,
          playerNameEn: row.playerNameEn,
          position: row.position,
          minutes: row.minutes ?? undefined,
          rating: row.rating ?? undefined,
          goals: row.goals ?? undefined,
          assists: row.assists ?? undefined,
          shots: row.shots ?? undefined,
          shotsOn: row.shotsOn ?? undefined,
          passes: row.passes ?? undefined,
          keyPasses: row.keyPasses ?? undefined,
          tackles: row.tackles ?? undefined,
          duelsWon: row.duelsWon ?? undefined,
          saves: row.saves ?? undefined,
          yellowCards: row.yellowCards ?? undefined,
          redCards: row.redCards ?? undefined,
          rawJson: row.rawJson as Prisma.InputJsonValue,
          syncedAt: now,
        },
      });
      upserted += 1;
    }

    const prevMeta = (facts?.liveMetaJson ?? {}) as LiveMetaJson;
    const liveMeta: LiveMetaJson = {
      ...prevMeta,
      lastPlayersSyncedAt: now.toISOString(),
    };
    await this.prisma.matchFacts.upsert({
      where: { matchId },
      create: {
        matchId,
        liveMetaJson: liveMeta as Prisma.InputJsonValue,
      },
      update: {
        liveMetaJson: liveMeta as Prisma.InputJsonValue,
      },
    });

    return {
      synced: true,
      fixtureId: fid,
      playersUpserted: upserted,
    };
  }
}

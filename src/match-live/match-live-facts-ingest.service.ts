import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus } from '@prisma/client';
import { MatchAfFactsLiveSyncService } from '../api-football/match-af-facts-live-sync.service';
import { MatchAfPlayersLiveSyncService } from '../api-football/match-af-players-live-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { LiveUpdatePublisherService } from './live-update.publisher.service';
import type { LiveMetaJson } from './live-event.types';
import { parseMatchEventsStorage } from './match-events-storage.util';
import { LiveCommentaryEnrichService } from './live-commentary-enrich.service';

@Injectable()
export class MatchLiveFactsIngestService {
  private readonly log = new Logger(MatchLiveFactsIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly afLive: MatchAfFactsLiveSyncService,
    private readonly afPlayers: MatchAfPlayersLiveSyncService,
    private readonly publisher: LiveUpdatePublisherService,
    private readonly redis: RedisService,
    private readonly commentaryEnrich: LiveCommentaryEnrichService,
  ) {}

  async syncLiveFactsForMatch(
    matchId: string,
    opts?: { force?: boolean },
  ): Promise<Record<string, unknown>> {
    const row = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { id: true, externalId: true },
    });
    if (!row) {
      return { error: 'match not found' };
    }
    if (!row.externalId?.startsWith('af-f-')) {
      return { skipped: true, reason: 'only af-f-* matches supported' };
    }
    const out = await this.afLive.syncLiveByMatchId(matchId, {
      force: opts?.force,
      delayMs: 400,
    });
    if (out.detail.synced) {
      const facts = await this.prisma.matchFacts.findUnique({
        where: { matchId },
        select: { liveMetaJson: true },
      });
      const seq = ((facts?.liveMetaJson ?? {}) as LiveMetaJson).seq ?? 0;
      await this.publisher.publish(matchId, seq);
      await this.redisDelLiveCache(matchId);
      void this.tryEnrichCommentary(matchId).catch(() => undefined);
    }
    return out.detail;
  }

  private async tryEnrichCommentary(matchId: string) {
    const row = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        homeScore: true,
        awayScore: true,
        matchFacts: { select: { events: true } },
      },
    });
    if (!row?.matchFacts) return;
    const events = parseMatchEventsStorage(row.matchFacts.events).items;
    await this.commentaryEnrich.maybeEnrich({
      matchId,
      events,
      homeScore: row.homeScore,
      awayScore: row.awayScore,
    });
  }

  private async redisDelLiveCache(matchId: string) {
    await this.redis.del(`matches:live:${matchId}`);
  }

  async runLiveFactsTick(opts?: {
    maxMatches?: number;
    delayBetweenMs?: number;
    minIntervalSec?: number;
    force?: boolean;
  }): Promise<{
    attempted: number;
    succeeded: number;
    failed: number;
    published: string[];
  }> {
    const maxM = Math.min(
      80,
      Math.max(1, opts?.maxMatches ?? this.config.get<number>('afLiveFactsMaxPerTick') ?? 4),
    );
    const delayMs = Math.min(
      5000,
      Math.max(0, opts?.delayBetweenMs ?? this.config.get<number>('afLiveFactsDelayMs') ?? 400),
    );
    const minIntervalSec =
      opts?.minIntervalSec ?? this.config.get<number>('afLiveFactsIntervalSec') ?? 90;

    const now = new Date();
    const staleFrom = new Date(now.getTime() - 12 * 3600_000);

    const rows = await this.prisma.match.findMany({
      where: {
        externalId: { startsWith: 'af-f-' },
        OR: [
          { status: MatchStatus.LIVE },
          {
            status: MatchStatus.SCHEDULED,
            kickoffTime: { lt: now, gte: staleFrom },
          },
        ],
      },
      orderBy: { kickoffTime: 'asc' },
      take: maxM,
      select: { id: true },
    });

    let succeeded = 0;
    let failed = 0;
    const published: string[] = [];

    for (const row of rows) {
      try {
        const out = await this.afLive.syncLiveByMatchId(row.id, {
          delayMs,
          force: opts?.force,
          minIntervalSec,
        });
        const detail = out.detail;

        if (detail.synced === true) {
          succeeded += 1;
          const facts = await this.prisma.matchFacts.findUnique({
            where: { matchId: row.id },
            select: { liveMetaJson: true },
          });
          const meta = (facts?.liveMetaJson ?? {}) as LiveMetaJson;
          const seq = meta.seq ?? 0;
          await this.publisher.publish(row.id, seq);
          await this.redisDelLiveCache(row.id);
          void this.tryEnrichCommentary(row.id).catch(() => undefined);
          if (published.length < 50) published.push(row.id);
        }
      } catch (e) {
        failed += 1;
        this.log.warn(
          `live facts ${row.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    return { attempted: rows.length, succeeded, failed, published };
  }

  async runLivePlayersTick(opts?: {
    maxMatches?: number;
    delayBetweenMs?: number;
    minIntervalSec?: number;
    force?: boolean;
  }): Promise<{
    attempted: number;
    succeeded: number;
    failed: number;
  }> {
    const maxM = Math.min(
      40,
      Math.max(1, opts?.maxMatches ?? this.config.get<number>('afLivePlayersMaxPerTick') ?? 3),
    );
    const delayMs = Math.min(
      5000,
      Math.max(0, opts?.delayBetweenMs ?? this.config.get<number>('afLivePlayersDelayMs') ?? 400),
    );
    const minIntervalSec =
      opts?.minIntervalSec ?? this.config.get<number>('afLivePlayersIntervalSec') ?? 120;

    const now = new Date();
    const staleFrom = new Date(now.getTime() - 12 * 3600_000);

    const rows = await this.prisma.match.findMany({
      where: {
        externalId: { startsWith: 'af-f-' },
        OR: [
          { status: MatchStatus.LIVE },
          {
            status: MatchStatus.SCHEDULED,
            kickoffTime: { lt: now, gte: staleFrom },
          },
        ],
      },
      orderBy: { kickoffTime: 'asc' },
      take: maxM,
      select: { id: true },
    });

    let succeeded = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        const out = await this.afPlayers.syncPlayersByMatchId(row.id, {
          delayMs,
          force: opts?.force,
          minIntervalSec,
        });
        if (out.synced === true) {
          succeeded += 1;
          await this.redisDelLiveCache(row.id);
        }
      } catch (e) {
        failed += 1;
        this.log.warn(
          `live players ${row.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    return { attempted: rows.length, succeeded, failed };
  }
}

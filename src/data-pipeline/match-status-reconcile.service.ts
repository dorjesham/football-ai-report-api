import { Injectable, Logger } from '@nestjs/common';
import { MatchStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiFootballIngestService } from '../api-football/api-football-ingest.service';

@Injectable()
export class MatchStatusReconcileService {
  private readonly log = new Logger(MatchStatusReconcileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly afIngest: ApiFootballIngestService,
  ) {}

  /** 近窗 AF 轮询 */
  async pollRecent() {
    return this.afIngest.pollRecentFixtureStatuses();
  }

  /**
   * 将「开球超过 staleHours 仍为 LIVE」且无最近 facts 同步的场次标为 FINISHED（保守修正）
   */
  async reconcileStaleLive(staleHours = 4) {
    const cutoff = new Date(Date.now() - staleHours * 3600_000);
    const stale = await this.prisma.match.findMany({
      where: {
        status: MatchStatus.LIVE,
        kickoffTime: { lt: cutoff },
        externalId: { startsWith: 'af-f-' },
      },
      select: { id: true, externalId: true, kickoffTime: true },
      take: 200,
    });
    if (!stale.length) {
      return { examined: 0, downgraded: 0 };
    }
    const poll = await this.pollRecent();
    let downgraded = 0;
    for (const m of stale) {
      const after = await this.prisma.match.findUnique({
        where: { id: m.id },
        select: { status: true },
      });
      if (after?.status === MatchStatus.LIVE) {
        await this.prisma.match.update({
          where: { id: m.id },
          data: { status: MatchStatus.FINISHED },
        });
        downgraded++;
        this.log.warn(`Downgraded stale LIVE → FINISHED: ${m.id}`);
      }
    }
    return { examined: stale.length, downgraded, poll };
  }

  /** 管理端展示：AF 场次且开球在合理窗口内的 LIVE */
  async countLikelyLiveNow() {
    const now = Date.now();
    const from = new Date(now - 3 * 3600_000);
    const to = new Date(now + 30 * 60_000);
    return this.prisma.match.count({
      where: {
        status: MatchStatus.LIVE,
        externalId: { startsWith: 'af-f-' },
        kickoffTime: { gte: from, lte: to },
      },
    });
  }
}

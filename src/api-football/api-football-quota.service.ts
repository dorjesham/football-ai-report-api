import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export class ApiFootballQuotaExceededError extends ServiceUnavailableException {
  constructor(used: number, limit: number) {
    super(
      `API-Football 日配额已用尽（${used}/${limit}）。请明日再试或由运维调高 API_FOOTBALL_DAILY_QUOTA。`,
    );
  }
}

@Injectable()
export class ApiFootballQuotaService {
  private readonly log = new Logger(ApiFootballQuotaService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  private dateKey(d = new Date()): string {
    return d.toISOString().slice(0, 10);
  }

  private logicalKey(d = new Date()): string {
    return `af:quota:${this.dateKey(d)}`;
  }

  dailyLimit(): number {
    return this.config.get<number>('apiFootballDailyQuota') ?? 7200;
  }

  /**
   * 预占 n 次上游调用额度。Redis 不可用时放行（仅记日志），避免全站读路径瘫痪。
   */
  async tryConsume(n = 1): Promise<boolean> {
    const limit = this.dailyLimit();
    const key = this.logicalKey();
    const steps = Math.max(1, Math.min(n, 50));
    for (let i = 0; i < steps; i++) {
      const used = await this.redis.incrDaily(key, 172_800);
      if (used === null) {
        if (i === 0) this.log.warn('Redis 不可用，跳过 AF 日配额扣减');
        return true;
      }
      if (used > limit) {
        this.log.warn(`AF quota exceeded: ${used}/${limit}`);
        return false;
      }
    }
    return true;
  }

  async assertConsumeAsync(n = 1): Promise<void> {
    const ok = await this.tryConsume(n);
    if (!ok) {
      const snap = await this.snapshot();
      throw new ApiFootballQuotaExceededError(snap.used, snap.limit);
    }
  }

  async snapshot(d = new Date()): Promise<{
    date: string;
    used: number;
    limit: number;
    remaining: number;
    redisEnabled: boolean;
  }> {
    const limit = this.dailyLimit();
    const date = this.dateKey(d);
    const raw = await this.redis.getString(this.logicalKey(d));
    const used = raw != null && raw !== '' ? Math.max(0, parseInt(raw, 10) || 0) : 0;
    const snap = {
      date,
      used,
      limit,
      remaining: Math.max(0, limit - used),
      redisEnabled: this.redis.enabled,
    };
    void this.persistDailySnapshot(snap.date, snap.used, snap.limit).catch((e) => {
      this.log.warn(`persist quota snapshot: ${String(e)}`);
    });
    return snap;
  }

  private async persistDailySnapshot(date: string, used: number, limit: number) {
    await this.prisma.afQuotaDailySnapshot.upsert({
      where: { date },
      create: { date, used, limit },
      update: { used, limit },
    });
  }

  async history(days = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceKey = since.toISOString().slice(0, 10);
    const rows = await this.prisma.afQuotaDailySnapshot.findMany({
      where: { date: { gte: sinceKey } },
      orderBy: { date: 'asc' },
    });
    return rows.map((r) => ({
      date: r.date,
      used: r.used,
      limit: r.limit,
    }));
  }
}

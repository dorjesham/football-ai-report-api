import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthService } from '../health/health.service';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApiFootballQuotaService } from '../api-football/api-football-quota.service';

export type SystemStatusLevel = 'ok' | 'warning' | 'error';

export type SystemStatusItem = {
  level: SystemStatusLevel;
  label: string;
};

@Injectable()
export class AdminSystemStatusService {
  constructor(
    private readonly health: HealthService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly afQuota: ApiFootballQuotaService,
    private readonly prisma: PrismaService,
  ) {}

  async getSystemStatus(): Promise<{
    database: SystemStatusItem;
    redis: SystemStatusItem;
    afApi: SystemStatusItem;
    aiProvider: SystemStatusItem;
    environment: SystemStatusItem;
  }> {
    const [db, redisOk, quota, aiFails] = await Promise.all([
      this.health.checkDb(),
      this.checkRedis(),
      this.afQuota.snapshot(),
      this.recentAiFailures(),
    ]);

    const hasAfKey = !!this.config.get<string>('apiFootballApiKey')?.trim();
    const hasAiKey = !!this.config.get<string>('deepseekApiKey')?.trim();
    const nodeEnv = this.config.get<string>('nodeEnv') ?? 'development';

    const quotaRatio = quota.limit > 0 ? quota.remaining / quota.limit : 1;

    return {
      database: {
        level: db.ok ? 'ok' : 'error',
        label: db.ok ? '数据库正常' : `数据库异常：${db.error ?? 'unknown'}`,
      },
      redis: {
        level: redisOk.level,
        label: redisOk.label,
      },
      afApi: {
        level: !hasAfKey ? 'error' : quotaRatio < 0.1 ? 'warning' : 'ok',
        label: !hasAfKey
          ? 'AF API 凭证未配置'
          : `AF API 配额剩余 ${Math.round(quotaRatio * 100)}%（${quota.remaining}/${quota.limit}）`,
      },
      aiProvider: {
        level: !hasAiKey ? 'warning' : aiFails > 0 ? 'warning' : 'ok',
        label: !hasAiKey
          ? 'AI Key 未配置'
          : aiFails > 0
            ? `AI 近 10 分钟有 ${aiFails} 次相关失败`
            : 'AI 服务正常',
      },
      environment: {
        level: 'ok',
        label: `环境：${nodeEnv}`,
      },
    };
  }

  private async checkRedis(): Promise<SystemStatusItem> {
    if (!this.redis.enabled) {
      return { level: 'warning', label: 'Redis 未连接（缓存降级）' };
    }
    const ok = await this.redis.ping();
    return ok
      ? { level: 'ok', label: 'Redis 正常' }
      : { level: 'error', label: 'Redis ping 失败' };
  }

  private async recentAiFailures(): Promise<number> {
    const since = new Date(Date.now() - 10 * 60_000);
    return this.prisma.ingestJobItem.count({
      where: {
        updatedAt: { gte: since },
        status: 'FAILED',
        OR: [
          { currentStep: { contains: 'ai' } },
          { errorMessage: { contains: 'deepseek' } },
          { errorMessage: { contains: 'AI' } },
        ],
      },
    });
  }
}

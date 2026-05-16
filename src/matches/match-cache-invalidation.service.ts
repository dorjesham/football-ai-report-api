import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * 比赛情报/详情相关 Redis 键的集中失效（与 MatchesService 读缓存键约定一致）。
 */
@Injectable()
export class MatchCacheInvalidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** 管理端改场次、换快照等：清匿名/全用户本场次、列表与赛事赛程缓存 */
  async invalidateAfterMatchDataChange(matchId: string): Promise<void> {
    await this.redis.del(
      `matches:intel:anon:${matchId}`,
      `matches:detail:anon:${matchId}`,
    );
    await this.redis.delPattern(`matches:intel:user:*:${matchId}`);
    await this.redis.delPattern(`matches:detail:user:*:${matchId}`);
    await this.redis.delPattern('matches:list:*');
    const row = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { tournament: { select: { code: true } } },
    });
    const code = row?.tournament?.code;
    if (code) {
      await this.redis.del(`tournaments:matches:${code}`);
    }
  }

  /** 单场报告解锁支付成功：仅清该用户本场次（库未改，会员态变） */
  async invalidateUserMatchUnlock(userId: string, matchId: string): Promise<void> {
    await this.redis.del(
      `matches:intel:user:${userId}:${matchId}`,
      `matches:detail:user:${userId}:${matchId}`,
    );
  }

  /** Pro 会员生效：该用户下已缓存的情报/详情可能从锁变开，按用户维度清理 */
  async invalidateAllUserMatchCaches(userId: string): Promise<void> {
    await this.redis.delPattern(`matches:intel:user:${userId}:*`);
    await this.redis.delPattern(`matches:detail:user:${userId}:*`);
  }
}

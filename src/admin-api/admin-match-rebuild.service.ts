import { Injectable } from '@nestjs/common';
import { MatchDetailBffService } from '../match-detail-bff/match-detail-bff.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class AdminMatchRebuildService {
  constructor(
    private readonly redis: RedisService,
    private readonly bff: MatchDetailBffService,
  ) {}

  async rebuildDetail(matchId: string, opts?: { warm?: boolean }) {
    const deleted = await this.redis.delPattern(`match-detail-v2:${matchId}:*`);
    let warmed = false;
    if (opts?.warm !== false) {
      try {
        await this.bff.getDetailV2(matchId, null);
        warmed = true;
      } catch {
        /* skip */
      }
    }
    return { matchId, deletedKeys: deleted, warmed };
  }
}

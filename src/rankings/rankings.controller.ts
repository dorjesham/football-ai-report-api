import { Controller, Get, GoneException, Query, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { CdnCacheHeadersInterceptor } from '../common/interceptors/cdn-cache-headers.interceptor';
import {
  PlayerRankingMetric,
  RankingsService,
  type RankingsSourceMode,
} from './rankings.service';

@ApiTags('rankings')
@Controller('rankings')
@Public()
@UseInterceptors(CdnCacheHeadersInterceptor)
export class RankingsController {
  constructor(private readonly rankings: RankingsService) {}

  @Get('players')
  @ApiOperation({
    summary: '球员榜单（公开只读）',
    description:
      'source=auto|db|api_football；competitionId 或 code+season；DB 空时 auto 回退 AF topscorers（服务端 BFF，浏览器勿直连 feed）。',
  })
  players(
    @Query('competitionId') competitionId?: string,
    @Query('code') code?: string,
    @Query('season') season?: string,
    @Query('metric') metric?: string,
    @Query('limit') limit?: string,
    @Query('source') source?: string,
  ) {
    const m = (metric || 'goals').toLowerCase();
    if (m === 'powerrating' || m === 'power_rating') {
      throw new GoneException(
        'metric=powerRating 已下线，请使用 goals 或 assists（API-Football 榜单）',
      );
    }
    const allowed: PlayerRankingMetric[] = [
      'fantasyPrice',
      'fbrefMinutes',
      'goals',
      'assists',
    ];
    const metricNorm = (allowed.includes(m as PlayerRankingMetric) ? m : 'goals') as PlayerRankingMetric;
    const seasonNum = parseInt(season || '2025', 10);
    const src = (source || 'auto').toLowerCase();
    const sourceNorm: RankingsSourceMode =
      src === 'db' || src === 'api_football' || src === 'auto' ? src : 'auto';
    return this.rankings.playerRanking({
      competitionId,
      code,
      season: Number.isFinite(seasonNum) ? seasonNum : 2025,
      metric: metricNorm,
      limit: limit ? parseInt(limit, 10) : 30,
      source: sourceNorm,
    });
  }

  @Get('leaderboards')
  @ApiOperation({
    summary: '榜单中心（积分榜 + 射手榜，只读 DB）',
    description:
      'codes 默认五大联赛+欧战+WC；season 用于联赛，wcSeason 用于 WC（默认 2026）。',
  })
  leaderboards(
    @Query('codes') codes?: string,
    @Query('season') season?: string,
    @Query('wcSeason') wcSeason?: string,
  ) {
    const seasonNum = parseInt(season || '2025', 10);
    const wcNum = parseInt(wcSeason || '2026', 10);
    return this.rankings.leaderboardsBundle({
      codes,
      season: Number.isFinite(seasonNum) ? seasonNum : 2025,
      wcSeason: Number.isFinite(wcNum) ? wcNum : 2026,
    });
  }
}

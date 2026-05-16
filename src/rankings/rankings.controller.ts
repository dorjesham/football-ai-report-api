import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { CdnCacheHeadersInterceptor } from '../common/interceptors/cdn-cache-headers.interceptor';
import { PlayerRankingMetric, RankingsService } from './rankings.service';

@ApiTags('rankings')
@Controller('rankings')
@Public()
@UseInterceptors(CdnCacheHeadersInterceptor)
export class RankingsController {
  constructor(private readonly rankings: RankingsService) {}

  @Get('players')
  @ApiOperation({ summary: '球员榜单（公开只读）' })
  players(
    @Query('competitionId') competitionId?: string,
    @Query('metric') metric?: string,
    @Query('limit') limit?: string,
  ) {
    const m = (metric || 'powerRating').toLowerCase();
    const allowed: PlayerRankingMetric[] = ['powerRating', 'fantasyPrice', 'fbrefMinutes'];
    const metricNorm = (allowed.includes(m as PlayerRankingMetric) ? m : 'powerRating') as PlayerRankingMetric;
    return this.rankings.playerRanking({
      competitionId,
      metric: metricNorm,
      limit: limit ? parseInt(limit, 10) : 30,
    });
  }
}

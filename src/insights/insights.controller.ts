import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { CdnCacheHeadersInterceptor } from '../common/interceptors/cdn-cache-headers.interceptor';
import { InsightsService } from './insights.service';

@ApiTags('insights')
@Controller('insights')
@Public()
@UseInterceptors(CdnCacheHeadersInterceptor)
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get('upset-signals')
  @ApiOperation({ summary: '冷门/高爆信号列表（基于 MatchPrediction.upsetIndex）' })
  upsetSignals(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('minUpset') minUpset?: string,
  ) {
    return this.insights.upsetSignals({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: limit ? parseInt(limit, 10) : 20,
      minUpset: minUpset ? parseInt(minUpset, 10) : 55,
    });
  }

  @Get('champion-prediction')
  @ApiOperation({ summary: '世界杯冠军预测启发式（v1）' })
  championPrediction(@Query('competitionId') competitionId: string) {
    return this.insights.championPrediction(
      competitionId?.trim() || 'seed-comp-wc',
    );
  }
}

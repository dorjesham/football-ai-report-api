import { Controller, Get, Headers, Param, UseInterceptors } from '@nestjs/common';
import { DetailV2DeprecationInterceptor } from '../common/interceptors/detail-v2-deprecation.interceptor';
import { DetailV2MetricsInterceptor } from '../metrics/detail-v2-metrics.interceptor';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';
import { Public } from '../common/decorators/public.decorator';
import { CdnCacheHeadersInterceptor } from '../common/interceptors/cdn-cache-headers.interceptor';
import { MatchDetailBffService } from './match-detail-bff.service';

@ApiTags('matches')
@Controller('matches')
@UseInterceptors(CdnCacheHeadersInterceptor)
export class MatchDetailBffController {
  constructor(
    private readonly detailBff: MatchDetailBffService,
    private readonly auth: AuthService,
  ) {}

  @Public()
  @ApiBearerAuth()
  @UseInterceptors(DetailV2DeprecationInterceptor, DetailV2MetricsInterceptor)
  @Get(':matchId/detail-v2')
  @ApiOperation({ summary: '比赛详情 v2（兼容路径，请用 /api/v2/matches/:id/detail）' })
  async detailV2(
    @Param('matchId') matchId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const viewer = await this.auth.resolveUserFromAuthHeader(authorization);
    return this.detailBff.getDetailV2(matchId, viewer);
  }
}

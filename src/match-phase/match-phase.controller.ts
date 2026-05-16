import { Controller, Get, Headers, Param, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { CdnCacheHeadersInterceptor } from '../common/interceptors/cdn-cache-headers.interceptor';
import { AuthService } from '../auth/auth.service';
import { MatchPhaseService } from './match-phase.service';

@ApiTags('matches')
@Controller('matches')
@UseInterceptors(CdnCacheHeadersInterceptor)
export class MatchPhaseController {
  constructor(
    private readonly phase: MatchPhaseService,
    private readonly auth: AuthService,
  ) {}

  @Public()
  @Get(':id/pre-match')
  @ApiOperation({
    summary: '赛前页合同（match-phase-v1）',
    description:
      '组合事实层（球队快照）、模型层（预测/赔率）、叙事层（PRE_MATCH 报告）。付费聚合仍见 GET .../intel。',
  })
  async preMatch(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const viewer = await this.auth.resolveUserFromAuthHeader(authorization);
    return this.phase.getCachedOrBuildPreMatch(id, viewer);
  }

  @Public()
  @Get(':id/post-match')
  @ApiOperation({
    summary: '赛后页合同（match-phase-v1）',
    description: '仅 FINISHED；含终场事实、预测对账、POST_MATCH 叙事。',
  })
  async postMatch(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const viewer = await this.auth.resolveUserFromAuthHeader(authorization);
    return this.phase.getCachedOrBuildPostMatch(id, viewer);
  }
}

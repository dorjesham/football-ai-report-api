import {
  Controller,
  Get,
  Headers,
  Param,
  Query,
  Sse,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { CdnCacheHeadersInterceptor } from '../common/interceptors/cdn-cache-headers.interceptor';
import { AuthService } from '../auth/auth.service';
import { MatchPhaseService } from '../match-phase/match-phase.service';
import { MatchLiveSseService } from './match-live-sse.service';

@ApiTags('matches')
@Controller('matches')
@UseInterceptors(CdnCacheHeadersInterceptor)
export class MatchLiveController {
  constructor(
    private readonly phase: MatchPhaseService,
    private readonly auth: AuthService,
    private readonly sse: MatchLiveSseService,
  ) {}

  @Public()
  @Get(':id/live')
  @ApiOperation({
    summary: '赛中页合同（match-phase-v1）',
    description:
      '外层 match-phase-v1；赛中事实见 facts.live（match-live-v1）。建议 LIVE 时 10–30s 轮询或配合 SSE。',
  })
  async getLive(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const viewer = await this.auth.resolveUserFromAuthHeader(authorization);
    return this.phase.buildLive(id, viewer);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Sse(':id/live/stream')
  @ApiOperation({
    summary: '赛中 SSE 推送（live_patch + 首包 snapshot）',
    description:
      '网关需关闭缓冲（X-Accel-Buffering: no）。Query `lastSeq` 用于重连去重。',
  })
  streamLive(
    @Param('id') id: string,
    @Query('lastSeq') lastSeq?: string,
  ) {
    const n = lastSeq ? parseInt(lastSeq, 10) : undefined;
    return this.sse.stream(id, {
      lastSeq: Number.isFinite(n) ? n : undefined,
    });
  }
}

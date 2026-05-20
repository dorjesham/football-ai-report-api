import { Controller, Get, Headers, Param, Post, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';
import { Public } from '../common/decorators/public.decorator';
import { RequiresVerifiedPhone } from '../common/decorators/requires-verified-phone.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/request-user.type';
import { CdnCacheHeadersInterceptor } from '../common/interceptors/cdn-cache-headers.interceptor';
import { DetailV2MetricsInterceptor } from '../metrics/detail-v2-metrics.interceptor';
import { OrdersService } from '../orders/orders.service';
import { MatchesV2Service } from './matches-v2.service';

@ApiTags('api-v2-matches')
@Controller('api/v2/matches')
@UseInterceptors(CdnCacheHeadersInterceptor)
export class MatchesV2Controller {
  constructor(
    private readonly matchesV2: MatchesV2Service,
    private readonly auth: AuthService,
    private readonly orders: OrdersService,
  ) {}

  @Public()
  @ApiBearerAuth()
  @UseInterceptors(DetailV2MetricsInterceptor)
  @Get(':matchId/detail')
  @ApiOperation({ summary: '比赛详情 v2（主路径）' })
  async detail(
    @Param('matchId') matchId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const viewer = await this.matchesV2.resolveViewer(authorization);
    return this.matchesV2.getDetail(matchId, viewer);
  }

  @Public()
  @ApiBearerAuth()
  @Get(':matchId/access')
  @ApiOperation({ summary: '解锁状态与权限' })
  async access(
    @Param('matchId') matchId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const viewer = await this.matchesV2.resolveViewer(authorization);
    return this.matchesV2.getAccess(matchId, viewer);
  }

  @RequiresVerifiedPhone()
  @Post(':matchId/unlock')
  @ApiOperation({ summary: '创建单场解锁订单' })
  unlock(@CurrentUser() user: RequestUser, @Param('matchId') matchId: string) {
    return this.orders.createForMatch(user.id, matchId);
  }
}

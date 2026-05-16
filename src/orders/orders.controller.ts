import { Body, Controller, Get, Param, Post, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/request-user.type';
import { CreateMembershipOrderDto } from './dto/create-membership-order.dto';
import { OrdersService } from './orders.service';
import { CdnCacheHeadersInterceptor } from '../common/interceptors/cdn-cache-headers.interceptor';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
@UseInterceptors(CdnCacheHeadersInterceptor)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** V2 价格表（公开，供小程序展示） */
  @Public()
  @Get('pricing')
  pricing() {
    return this.orders.pricingCatalog();
  }

  @Post('membership/create')
  createMembership(@CurrentUser() user: RequestUser, @Body() body: CreateMembershipOrderDto) {
    return this.orders.createMembershipOrder(user.id, body.plan);
  }

  @Post('social-poster/matches/:matchId/create')
  createPoster(@CurrentUser() user: RequestUser, @Param('matchId') matchId: string) {
    return this.orders.createPosterOrder(user.id, matchId);
  }

  @Post('matches/:matchId/create')
  create(@CurrentUser() user: RequestUser, @Param('matchId') matchId: string) {
    return this.orders.createForMatch(user.id, matchId);
  }

  @Get(':orderNo')
  one(@CurrentUser() user: RequestUser, @Param('orderNo') orderNo: string) {
    return this.orders.byOrderNo(user.id, orderNo);
  }
}

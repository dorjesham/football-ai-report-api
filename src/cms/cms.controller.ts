import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { CdnCacheHeadersInterceptor } from '../common/interceptors/cdn-cache-headers.interceptor';
import { OrdersService } from '../orders/orders.service';
import { CmsService } from './cms.service';

@ApiTags('cms')
@Controller('cms')
@Public()
@UseInterceptors(CdnCacheHeadersInterceptor)
export class CmsController {
  constructor(
    private readonly cms: CmsService,
    private readonly orders: OrdersService,
  ) {}

  @Get('tools')
  @ApiOperation({ summary: '工具入口配置（内置默认）' })
  tools() {
    return this.cms.listTools();
  }

  @Get('materials')
  @ApiOperation({ summary: '创作者素材列表' })
  materials(@Query('category') category?: string) {
    return this.cms.listMaterials(category);
  }

  @Get('membership-plans')
  @ApiOperation({ summary: '会员权益对比（与 GET /orders/pricing 的 features 一致）' })
  membershipPlans() {
    const p = this.orders.pricingCatalog();
    return {
      currency: p.currency,
      membership: p.membership,
      features: p.features,
    };
  }

  @Get('reports')
  @ApiOperation({ summary: '报告发现页 / 专题样例列表（内置配置）' })
  reports(
    @Query('category') category?: string,
    @Query('type') type?: string,
  ) {
    return this.cms.listReports({ category, type });
  }
}

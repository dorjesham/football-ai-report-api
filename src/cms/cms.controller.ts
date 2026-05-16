import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { CdnCacheHeadersInterceptor } from '../common/interceptors/cdn-cache-headers.interceptor';
import { CmsService } from './cms.service';

@ApiTags('cms')
@Controller('cms')
@Public()
@UseInterceptors(CdnCacheHeadersInterceptor)
export class CmsController {
  constructor(private readonly cms: CmsService) {}

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
}

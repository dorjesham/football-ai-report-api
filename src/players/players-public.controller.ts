import { Controller, Get, Param, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { CdnCacheHeadersInterceptor } from '../common/interceptors/cdn-cache-headers.interceptor';
import { PlayersPublicService } from './players-public.service';

@ApiTags('players')
@Controller('players')
@Public()
@UseInterceptors(CdnCacheHeadersInterceptor)
export class PlayersPublicController {
  constructor(private readonly players: PlayersPublicService) {}

  @Get(':id/summary')
  @ApiOperation({ summary: '球员公开摘要（榜单/对比页）' })
  summary(@Param('id') id: string) {
    return this.players.summary(id);
  }
}

import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { CatalogV2Service } from './catalog-v2.service';

@ApiTags('api-v2-catalog')
@Controller('api/v2')
@Public()
export class CatalogV2Controller {
  constructor(private readonly catalog: CatalogV2Service) {}

  @Get('teams/:teamId/transfers')
  @ApiOperation({ summary: 'B4 球队转会' })
  transfers(
    @Param('teamId') teamId: string,
    @Query('season') season?: string,
  ) {
    const s = season ? parseInt(season, 10) : undefined;
    return this.catalog.teamTransfers(teamId, Number.isFinite(s as number) ? s : undefined);
  }

  @Get('teams/:teamId/trophies')
  teamTrophies(@Param('teamId') teamId: string) {
    return this.catalog.teamTrophies(teamId);
  }

  @Get('players/:playerId/trophies')
  playerTrophies(@Param('playerId') playerId: string) {
    return this.catalog.playerTrophies(playerId);
  }

  @Get('players/:playerId/sidelined')
  sidelined(@Param('playerId') playerId: string) {
    return this.catalog.playerSidelined(playerId);
  }
}

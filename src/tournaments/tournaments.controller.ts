import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TournamentType } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { TournamentsService } from './tournaments.service';
import { CdnCacheHeadersInterceptor } from '../common/interceptors/cdn-cache-headers.interceptor';

@ApiTags('tournaments')
@Controller('tournaments')
@UseInterceptors(CdnCacheHeadersInterceptor)
export class TournamentsController {
  constructor(private readonly tournaments: TournamentsService) {}

  @Public()
  @Get()
  list(
    @Query('type') type?: TournamentType,
    @Query('isActive') isActive?: string,
  ) {
    return this.tournaments.findAll({
      type,
      isActive: isActive === undefined ? undefined : isActive === 'true',
    });
  }

  @Public()
  @Get(':code')
  byCode(@Param('code') code: string) {
    return this.tournaments.findByCode(code);
  }

  @Public()
  @Get(':code/competitions')
  comps(@Param('code') code: string) {
    return this.tournaments.competitionsByCode(code);
  }

  @Public()
  @Get(':code/standings')
  @ApiOperation({ summary: '赛事下属杯赛积分榜（优先 WC 杯赛实例）' })
  standings(@Param('code') code: string, @Query('group') group?: string) {
    return this.tournaments.standingsByTournamentCode(code, group);
  }

  @Public()
  @Get(':code/matches')
  matches(@Param('code') code: string) {
    return this.tournaments.matchesByCode(code);
  }
}

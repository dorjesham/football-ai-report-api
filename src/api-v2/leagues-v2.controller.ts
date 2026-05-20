import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { LeaguesV2Service } from './leagues-v2.service';

@ApiTags('api-v2-leagues')
@Controller('api/v2/leagues')
@Public()
export class LeaguesV2Controller {
  constructor(private readonly leagues: LeaguesV2Service) {}

  private seasonNum(season?: string) {
    const n = parseInt(season || '2025', 10);
    return Number.isFinite(n) ? n : 2025;
  }

  @Get(':code/standings')
  @ApiOperation({ summary: '积分榜（LeagueAfCache）' })
  standings(@Param('code') code: string, @Query('season') season?: string) {
    return this.leagues.standings(code, this.seasonNum(season));
  }

  @Get(':code/topscorers')
  topscorers(@Param('code') code: string, @Query('season') season?: string) {
    return this.leagues.topscorers(code, this.seasonNum(season));
  }

  @Get(':code/topassists')
  topassists(@Param('code') code: string, @Query('season') season?: string) {
    return this.leagues.topassists(code, this.seasonNum(season));
  }

  @Get(':code/topyellowcards')
  topyellow(@Param('code') code: string, @Query('season') season?: string) {
    return this.leagues.topyellowcards(code, this.seasonNum(season));
  }

  @Get(':code/topredcards')
  topred(@Param('code') code: string, @Query('season') season?: string) {
    return this.leagues.topredcards(code, this.seasonNum(season));
  }

  @Get(':code/rounds')
  rounds(@Param('code') code: string, @Query('season') season?: string) {
    return this.leagues.rounds(code, this.seasonNum(season));
  }
}

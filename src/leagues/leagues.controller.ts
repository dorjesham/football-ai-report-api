import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { MatchInjuriesService } from '../matches/match-injuries.service';
import {
  LeaguesStandingsService,
  type StandingsSourceMode,
} from './leagues-standings.service';

@ApiTags('leagues')
@Controller('leagues')
export class LeaguesController {
  constructor(
    private readonly standings: LeaguesStandingsService,
    private readonly injuries: MatchInjuriesService,
  ) {}

  @Public()
  @Get('standings')
  @ApiOperation({
    summary: '多联赛积分榜（BFF，规范化 api-sports）',
    description:
      '默认 codes=PL,PD,SA,BL1,FL1,CL,EL；season=2025。source=auto|db|api_football。',
  })
  batchStandings(
    @Query('codes') codes?: string,
    @Query('season') season?: string,
    @Query('source') source?: string,
  ) {
    const seasonNum = parseInt(season || '2025', 10);
    return this.standings.standingsBatch(
      codes,
      Number.isFinite(seasonNum) ? seasonNum : 2025,
      this.parseSource(source),
    );
  }

  @Public()
  @Get(':code/injuries')
  @ApiOperation({ summary: '联赛伤停（BFF）' })
  leagueInjuries(
    @Param('code') code: string,
    @Query('season') season?: string,
    @Query('teamId') teamId?: string,
    @Query('apiTeamId') apiTeamId?: string,
  ) {
    const seasonNum = parseInt(season || '2025', 10);
    return this.injuries.forLeagueTeam({
      code,
      season: Number.isFinite(seasonNum) ? seasonNum : 2025,
      teamId,
      apiTeamId: apiTeamId ? parseInt(apiTeamId, 10) : undefined,
    });
  }

  @Public()
  @Get(':code/standings')
  @ApiOperation({ summary: '单联赛积分榜（BFF）' })
  oneStandings(
    @Param('code') code: string,
    @Query('season') season?: string,
    @Query('source') source?: string,
  ) {
    const seasonNum = parseInt(season || '2025', 10);
    return this.standings.standingsForCode(
      code,
      Number.isFinite(seasonNum) ? seasonNum : 2025,
      this.parseSource(source),
    );
  }

  private parseSource(raw?: string): StandingsSourceMode {
    const s = (raw || 'auto').toLowerCase();
    if (s === 'db' || s === 'api_football' || s === 'auto') return s;
    return 'auto';
  }
}

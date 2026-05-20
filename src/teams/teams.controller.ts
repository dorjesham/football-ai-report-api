import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { CdnCacheHeadersInterceptor } from '../common/interceptors/cdn-cache-headers.interceptor';
import { TeamsScheduleService } from './teams-schedule.service';

@ApiTags('teams')
@Controller('teams')
@Public()
@UseInterceptors(CdnCacheHeadersInterceptor)
export class TeamsController {
  constructor(private readonly schedule: TeamsScheduleService) {}

  @Get(':teamId/upcoming-schedule')
  @ApiOperation({
    summary: '球队未来赛程与难度（Schedule 工具页）',
    description: 'difficulty 基于对手联赛积分榜 rank 启发式，非官方 FDR。',
  })
  upcomingSchedule(
    @Param('teamId') teamId: string,
    @Query('days') days?: string,
    @Query('season') season?: string,
  ) {
    const d = parseInt(days || '30', 10);
    const seasonNum = parseInt(season || '2025', 10);
    return this.schedule.upcomingSchedule(
      teamId,
      Number.isFinite(d) ? d : 30,
      Number.isFinite(seasonNum) ? seasonNum : 2025,
    );
  }
}

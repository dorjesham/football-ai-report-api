import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../common/decorators/admin-only.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { PublicSourcesService } from './public-sources.service';

@ApiTags('public-sources')
@ApiBearerAuth()
@AdminOnly()
@UseGuards(AdminGuard)
@Controller('public-sources')
export class PublicSourcesController {
  constructor(private readonly svc: PublicSourcesService) {}

  @Post('matches/:id/fetch')
  fetch(@Param('id') id: string, @Query('force') force?: string) {
    return this.svc.fetchForMatch(id, { force: force === 'true' });
  }

  /** 列出该杯赛实例在赛程中出现过的球队（可选 seasonId），便于先对齐队名再逐场 fetch。 */
  @Get('competitions/:competitionId/teams-for-fetch')
  teamsForFetch(
    @Param('competitionId') competitionId: string,
    @Query('seasonId') seasonId?: string,
  ) {
    return this.svc.listCompetitionTeamsForPublicFetch(competitionId, seasonId);
  }

  @Get('matches/:id')
  list(@Param('id') id: string) {
    return this.svc.listForMatch(id);
  }

  @Post('matches/:id/manual')
  manual(
    @Param('id') id: string,
    @Body() body: { title?: string; content?: string; sourceUrl?: string },
  ) {
    return this.svc.manual(id, body);
  }

  @Post('import/kaggle-placeholder')
  kagglePlaceholder(@Body() body: Record<string, unknown>) {
    return this.svc.kagglePlaceholderJob(body || {});
  }
}

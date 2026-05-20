import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminOnly } from '../common/decorators/admin-only.decorator';
import { WorldCupAdminService } from './world-cup-admin.service';

@ApiTags('admin-api')
@ApiBearerAuth()
@AdminOnly()
@UseGuards(AdminGuard)
@Controller('admin/api/world-cup')
export class WorldCupAdminController {
  constructor(private readonly svc: WorldCupAdminService) {}

  @Get('overview')
  @ApiOperation({ summary: '世界杯运维总览' })
  overview() {
    return this.svc.getOverview();
  }

  @Post('bootstrap')
  @ApiOperation({ summary: '世界杯 AF 全量 Bootstrap' })
  bootstrap(@Body() body: Record<string, unknown>) {
    return this.svc.startBootstrap({
      season: Number(body.season) || undefined,
      maxParallel: Number(body.maxParallel) || undefined,
      dryRun: body.dryRun === true,
      generateAiDrafts: body.generateAiDrafts === true,
      resumeFromStep:
        typeof body.resumeFromStep === 'string' ? body.resumeFromStep : undefined,
    });
  }

  @Get('matches')
  @ApiOperation({ summary: '世界杯比赛列表（含 coverage）' })
  matches(
    @Query('coverage') coverage?: 'red' | 'yellow' | 'green',
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.listMatches({
      coverage,
      status,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
  }

  @Get('matches/:matchId/coverage')
  @ApiOperation({ summary: '单场 coverage + gate' })
  coverage(@Param('matchId') matchId: string) {
    return this.svc.getMatchCoverage(matchId);
  }

  @Post('matches/:matchId/reconcile')
  @ApiOperation({ summary: '单场补全链路' })
  reconcile(
    @Param('matchId') matchId: string,
    @Body() body: { includeAi?: boolean; dryRun?: boolean },
  ) {
    return this.svc.reconcileMatch(matchId, body ?? {});
  }

  @Get('teams')
  @ApiOperation({ summary: '世界杯国家队列表' })
  teams() {
    return this.svc.listTeams();
  }

  @Post('teams/:teamId/refresh-profile')
  @ApiOperation({ summary: '刷新球队 AF profile' })
  refreshTeam(@Param('teamId') teamId: string) {
    return this.svc.refreshTeamProfile(teamId);
  }

  @Post('predictions/generate')
  @ApiOperation({ summary: '批量生成 AF 预测' })
  predictions(@Body() body: { matchIds?: string[]; onlyMissing?: boolean }) {
    return this.svc.batchPredictions(body ?? {});
  }

  @Post('ai/generate-drafts')
  @ApiOperation({ summary: '批量生成 AI 草稿' })
  aiDrafts(
    @Body()
    body: {
      matchIds?: string[];
      onlyPublishable?: boolean;
      forceRegenerateDraft?: boolean;
    },
  ) {
    return this.svc.batchAiDrafts(body ?? {});
  }

  @Get('team-name-overrides')
  teamNameOverrides() {
    return this.svc.listTeamNameOverrides();
  }

  @Post('team-name-overrides')
  upsertTeamNameOverride(@Body() body: { apiFootballTeamId: number; nameCn: string }) {
    return this.svc.upsertTeamNameOverride(body.apiFootballTeamId, body.nameCn);
  }

  @Get('standings')
  standings(@Query('season') season?: string) {
    return this.svc.getStandings(season ? Number(season) : undefined);
  }

  @Get('leaderboards')
  leaderboards(
    @Query('season') season?: string,
    @Query('metric') metric?: string,
  ) {
    return this.svc.getLeaderboards(
      season ? Number(season) : undefined,
      metric ?? 'goals',
    );
  }

  @Post('teams/:teamId/manual-profile')
  patchTeamManual(
    @Param('teamId') teamId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.svc.patchTeamManual(teamId, body);
  }
}

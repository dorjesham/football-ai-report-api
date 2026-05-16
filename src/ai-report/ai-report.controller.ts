import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AiReportType } from '@prisma/client';
import { AdminOnly } from '../common/decorators/admin-only.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/request-user.type';
import { MatchLlmDossierService } from '../match-llm-dossier/match-llm-dossier.service';
import { AiReportReviewService } from './ai-report-review.service';
import { AiReportService } from './ai-report.service';
import { LiveNarrativeReportService } from './live-narrative-report.service';
import { PostMatchReportService } from './post-match-report.service';

@ApiTags('ai-report')
@ApiBearerAuth()
@AdminOnly()
@UseGuards(AdminGuard)
@Controller()
export class AiReportController {
  constructor(
    private readonly svc: AiReportService,
    private readonly dossier: MatchLlmDossierService,
    private readonly postMatch: PostMatchReportService,
    private readonly liveNarrative: LiveNarrativeReportService,
    private readonly review: AiReportReviewService,
  ) {}

  @Get('matches/:id/llm-dossier')
  @ApiOperation({
    summary: '预览分层 LLM 档案（dataAvailability + 各层摘要）',
    description:
      'prepare=0（默认）仅读库组装；prepare=1 会先尝试 FD 单场 intel 与公开来源抓取再组装，便于联调。',
  })
  @ApiQuery({ name: 'prepare', required: false, schema: { enum: ['0', '1'] } })
  dossierPreview(@Param('id') id: string, @Query('prepare') prepare?: string) {
    if (prepare === '1') return this.dossier.prepareEnrichedDossier(id);
    return this.dossier.buildDossier(id);
  }

  @Post('matches/:id/generate-report')
  generate(@Param('id') id: string) {
    return this.svc.generate(id);
  }

  @Post('matches/:id/publish-report')
  publish(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.svc.publish(id, user);
  }

  @Post('matches/:id/generate-post-match-report')
  @ApiOperation({ summary: '生成赛后结构化复盘（规则+LLM润色）' })
  generatePostMatch(@Param('id') id: string) {
    return this.postMatch.generatePostMatch(id);
  }

  @Post('matches/:id/generate-live-narrative')
  @ApiOperation({ summary: '生成文字直播叙事报告（LIVE/FINISHED）' })
  generateLiveNarrative(@Param('id') id: string) {
    return this.liveNarrative.generateLiveNarrative(id);
  }

  @Post('matches/:id/reports/:reportId/submit-review')
  submitReview(@Param('id') id: string, @Param('reportId') reportId: string) {
    return this.review.submitForReview(id, reportId);
  }

  @Post('matches/:id/reports/:reportId/approve')
  approve(
    @Param('id') id: string,
    @Param('reportId') reportId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.review.approve(id, reportId, user);
  }

  @Post('matches/:id/reports/:reportId/reject')
  reject(
    @Param('id') id: string,
    @Param('reportId') reportId: string,
    @CurrentUser() user: RequestUser,
    @Body() body?: { reason?: string },
  ) {
    return this.review.reject(id, reportId, user, body?.reason);
  }

  @Get('matches/:id/reports')
  @ApiQuery({ name: 'type', required: false, enum: AiReportType })
  list(@Param('id') id: string, @Query('type') type?: AiReportType) {
    return this.svc.list(id, type);
  }
}

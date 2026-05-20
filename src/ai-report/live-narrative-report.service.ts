import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AiReportType, MatchStatus, ReportStatus } from '@prisma/client';
import { DEFAULT_AI_DISCLAIMER } from '../common/constants/disclaimer.constant';
import { sanitizeAiReportText } from '../common/utils/content-safety';
import { MatchLiveService } from '../match-live/match-live.service';
import { PrismaService } from '../prisma/prisma.service';
import { DeepseekService } from '../deepseek/deepseek.service';
import { buildLiveNarrativeStructured } from './live-narrative.builder';
import {
  polishedToFreeSummary,
  structuredToPolishPrompt,
} from './structured-report-polish.util';

const POLISH_SYSTEM =
  '你是足球文字直播编辑。你只能改写输入 JSON 中 sections 各字段的中文，使叙述更连贯。' +
  '严禁新增数字、球员、进球或赛果。输出 JSON：{ sections: Record<string,string>, disclaimer?: string }。';

@Injectable()
export class LiveNarrativeReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deepseek: DeepseekService,
    private readonly matchLive: MatchLiveService,
  ) {}

  async generateLiveNarrative(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { id: true, status: true, activePredictionId: true },
    });
    if (!match) throw new NotFoundException('Match not found');
    if (
      match.status !== MatchStatus.LIVE &&
      match.status !== MatchStatus.FINISHED
    ) {
      throw new BadRequestException('Live narrative requires LIVE or FINISHED');
    }

    const live = await this.matchLive.build(matchId);
    const structured = buildLiveNarrativeStructured(live);

    const prediction = match.activePredictionId
      ? await this.prisma.matchPrediction.findUnique({
          where: { id: match.activePredictionId },
        })
      : null;

    const { userPrompt } = structuredToPolishPrompt(structured);
    const polished = await this.deepseek.polishStructuredReport(POLISH_SYSTEM, userPrompt);
    const freeRaw = polishedToFreeSummary(polished.sections, 'live-narrative-v1');
    const sum = sanitizeAiReportText(freeRaw);

    return this.prisma.aiReport.create({
      data: {
        matchId,
        reportType: AiReportType.LIVE_NARRATIVE,
        predictionId: prediction?.id ?? null,
        oddsSnapshotId: prediction?.oddsSnapshotId ?? null,
        structuredContentJson: structured as object,
        freeSummary: sum.text,
        dashboardSummary: polished.sections.summary?.slice(0, 500) ?? null,
        disclaimer: polished.disclaimer || DEFAULT_AI_DISCLAIMER,
        status: ReportStatus.DRAFT,
        rawInput: { liveMeta: live.meta } as object,
        rawOutput: polished as object,
        contentWarnings: sum.warnings.length ? sum.warnings : undefined,
      },
    });
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MatchStatus } from '@prisma/client';
import { DEFAULT_AI_DISCLAIMER } from '../common/constants/disclaimer.constant';
import { sanitizeAiReportText } from '../common/utils/content-safety';
import { PrismaService } from '../prisma/prisma.service';
import { DeepseekService } from '../deepseek/deepseek.service';
import { buildPostMatchStructured } from './post-match-analysis.builder';
import {
  polishedToFreeSummary,
  structuredToPolishPrompt,
} from './structured-report-polish.util';
import { upsertPostMatchDraft } from './ai-report-draft-persistence.util';

const POLISH_SYSTEM =
  '你是足球赛后复盘文案编辑。你只能改写输入 JSON 中 sections 各字段的中文表述，使语句更流畅。' +
  '严禁新增任何数字、比分、球员姓名、球队名或赛果。不得提供投注建议。输出合法 JSON：{ sections: Record<string,string>, disclaimer?: string }。';

@Injectable()
export class PostMatchReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deepseek: DeepseekService,
  ) {}

  async generatePostMatch(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeTeam: true,
        awayTeam: true,
        matchFacts: true,
        activePrediction: { include: { grading: true, oddsSnapshot: true } },
      },
    });
    if (!match) throw new NotFoundException('Match not found');
    if (match.status !== MatchStatus.FINISHED) {
      throw new BadRequestException('Post-match report requires FINISHED status');
    }

    const prediction =
      match.activePrediction?.lockedAt != null ? match.activePrediction : null;
    const grading = prediction?.grading ?? null;

    const structured = buildPostMatchStructured({
      match,
      facts: match.matchFacts,
      prediction,
      grading,
    });

    const { userPrompt } = structuredToPolishPrompt(structured);
    const polished = await this.deepseek.polishStructuredReport(POLISH_SYSTEM, userPrompt);
    const freeRaw = polishedToFreeSummary(polished.sections, 'post-match-analysis-v1');
    const sum = sanitizeAiReportText(freeRaw);

    const { report, reused } = await upsertPostMatchDraft(this.prisma, {
      matchId,
      predictionId: prediction?.id ?? null,
      oddsSnapshotId: prediction?.oddsSnapshotId ?? null,
      structuredContentJson: structured as object,
      freeSummary: sum.text,
      dashboardSummary: polished.sections.recap?.slice(0, 500) ?? null,
      disclaimer: polished.disclaimer || DEFAULT_AI_DISCLAIMER,
      rawInput: { structured } as object,
      rawOutput: polished as object,
      contentWarnings: sum.warnings.length ? sum.warnings : undefined,
    });

    return { ...report, reused };
  }
}

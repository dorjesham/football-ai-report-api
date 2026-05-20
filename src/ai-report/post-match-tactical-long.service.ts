import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AiReportType, MatchStatus, ReportStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildPostMatchStructured } from './post-match-analysis.builder';
import { buildPostMatchTacticalEnvelope } from './facts-envelope/post-match-tactical-envelope.builder';
import { hashEnvelope } from './facts-envelope/envelope-hash.util';
import { formatFactsEnvelopeForPrompt } from './facts-envelope/format-envelope-for-prompt.util';
import { buildPostMatchTacticalLongSystemPrompt } from './prompts/post-match-tactical-long.system';
import { PostMatchStructuredV1Schema } from './schemas/structured-report.schema';
import { PostMatchTacticalLongV1Schema } from './schemas/facts-envelope.schema';
import { DeepseekService } from '../deepseek/deepseek.service';

@Injectable()
export class PostMatchTacticalLongService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deepseek: DeepseekService,
  ) {}

  async generate(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeTeam: true,
        awayTeam: true,
        competition: true,
        matchFacts: true,
        activePrediction: { include: { grading: true } },
      },
    });
    if (!match) throw new NotFoundException('Match not found');
    if (match.status !== MatchStatus.FINISHED) {
      throw new BadRequestException('完赛战术长文仅适用于已结束的比赛');
    }

    const prediction =
      match.activePrediction?.lockedAt != null ? match.activePrediction : null;
    const structured = buildPostMatchStructured({
      match,
      facts: match.matchFacts,
      prediction,
      grading: prediction?.grading ?? null,
    });

    const envelope = buildPostMatchTacticalEnvelope({
      match,
      facts: match.matchFacts,
      structured,
    });

    const user = formatFactsEnvelopeForPrompt(
      envelope,
      '请生成完赛战术复盘长文（十一节结构）。',
    );
    const longForm = await this.deepseek.generateMarkdownLongForm(
      buildPostMatchTacticalLongSystemPrompt(),
      user,
    );

    const tacticalLongV1 = PostMatchTacticalLongV1Schema.parse({
      markdown: longForm.markdown,
      sections: longForm.sections,
      envelopeHash: hashEnvelope(envelope),
      generatedAt: new Date().toISOString(),
    });

    const existing = await this.prisma.aiReport.findFirst({
      where: {
        matchId,
        reportType: AiReportType.POST_MATCH,
        status: { in: [ReportStatus.DRAFT, ReportStatus.REVIEW, ReportStatus.PUBLISHED] },
      },
      orderBy: { createdAt: 'desc' },
    });

    const baseStructured = PostMatchStructuredV1Schema.parse(structured);
    const prevJson = existing?.structuredContentJson;
    const prevParsed = PostMatchStructuredV1Schema.safeParse(prevJson);
    const mergedStructured = {
      ...(prevParsed.success ? prevParsed.data : baseStructured),
      tacticalLongV1,
    };

    if (existing) {
      return this.prisma.aiReport.update({
        where: { id: existing.id },
        data: {
          structuredContentJson: mergedStructured as object,
          rawOutput: longForm as object,
        },
      });
    }

    return this.prisma.aiReport.create({
      data: {
        matchId,
        reportType: AiReportType.POST_MATCH,
        predictionId: prediction?.id ?? null,
        freeSummary: longForm.markdown.slice(0, 800),
        disclaimer:
          '本内容为 AI 根据比赛事实扩写，仅供阅读，不构成投注建议或赛果保证。',
        status: ReportStatus.DRAFT,
        structuredContentJson: { ...baseStructured, tacticalLongV1 } as object,
        rawInput: { envelope, structured } as object,
        rawOutput: longForm as object,
      },
    });
  }
}

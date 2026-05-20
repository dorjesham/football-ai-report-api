import { Injectable, NotFoundException } from '@nestjs/common';
import { AiReportType, ReportStatus } from '@prisma/client';
import { MatchLlmDossierService } from '../match-llm-dossier/match-llm-dossier.service';
import { PrismaService } from '../prisma/prisma.service';
import { DeepseekService } from '../deepseek/deepseek.service';
import { buildPreMatchIntelEnvelope } from './facts-envelope/pre-match-intel-envelope.builder';
import { hashEnvelope } from './facts-envelope/envelope-hash.util';
import { formatFactsEnvelopeForPrompt } from './facts-envelope/format-envelope-for-prompt.util';
import { buildPreMatchIntelLongSystemPrompt } from './prompts/pre-match-intel-long.system';
import { PreMatchIntelLongV1Schema } from './schemas/facts-envelope.schema';

@Injectable()
export class PreMatchIntelLongService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dossier: MatchLlmDossierService,
    private readonly deepseek: DeepseekService,
  ) {}

  async generate(matchId: string, opts?: { skipExternalPreparation?: boolean }) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        headToHead: true,
        matchFacts: { select: { injuriesJson: true } },
      },
    });
    if (!match) throw new NotFoundException('Match not found');

    const enriched = opts?.skipExternalPreparation
      ? await this.dossier.buildDossier(matchId)
      : await this.dossier.prepareEnrichedDossier(matchId);

    const envelope = buildPreMatchIntelEnvelope(matchId, enriched, {
      headToHead: match.headToHead,
      injuriesJson: match.matchFacts?.injuriesJson,
    });

    const user = formatFactsEnvelopeForPrompt(
      envelope,
      '请生成赛前深度情报长文（十一节结构）。',
    );
    const longForm = await this.deepseek.generateMarkdownLongForm(
      buildPreMatchIntelLongSystemPrompt(),
      user,
    );

    const payload = PreMatchIntelLongV1Schema.parse({
      markdown: longForm.markdown,
      sections: longForm.sections,
      envelopeHash: hashEnvelope(envelope),
      generatedAt: new Date().toISOString(),
    });

    const existing = await this.prisma.aiReport.findFirst({
      where: { matchId, reportType: AiReportType.PRE_MATCH },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      const prev =
        existing.structuredContentJson &&
        typeof existing.structuredContentJson === 'object'
          ? (existing.structuredContentJson as Record<string, unknown>)
          : {};
      return this.prisma.aiReport.update({
        where: { id: existing.id },
        data: {
          structuredContentJson: {
            ...prev,
            preMatchIntelLongV1: payload,
          } as object,
          rawOutput: longForm as object,
        },
      });
    }

    return this.prisma.aiReport.create({
      data: {
        matchId,
        reportType: AiReportType.PRE_MATCH,
        freeSummary: longForm.markdown.slice(0, 450),
        disclaimer:
          '本内容为 AI 根据公开与结构化数据扩写，仅供赛前阅读，不构成投注建议或赛果保证。',
        status: ReportStatus.DRAFT,
        structuredContentJson: { preMatchIntelLongV1: payload } as object,
        rawInput: { envelope } as object,
        rawOutput: longForm as object,
      },
    });
  }

  async attachToReport(reportId: string) {
    const report = await this.prisma.aiReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');
    return this.generate(report.matchId, { skipExternalPreparation: true });
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AiReportType, ReportStatus, UserRole } from '@prisma/client';
import { LLM_DATA_STEWARD_ADDENDUM } from '../match-llm-dossier/llm-dossier-policy';
import { MatchLlmDossierService } from '../match-llm-dossier/match-llm-dossier.service';
import { PrismaService } from '../prisma/prisma.service';
import { DeepseekService } from './deepseek.service';
import { DEFAULT_AI_DISCLAIMER } from '../common/constants/disclaimer.constant';
import { validateReportBeforePublish, sanitizeAiReportText } from '../common/utils/content-safety';
import { RequestUser } from '../common/types/request-user.type';

const AI_REPORT_BASE_SYSTEM =
  '你是一名足球赛前情报分析助手。你只能根据输入的结构化数据生成中文分析报告。不得编造任何真实数据。不得提供投注建议。不得承诺赛果。必须输出合法 JSON。缺少数据时必须写“暂无可靠公开数据”。所有预测类内容必须明确属于“模型估算”或“AI推演”。';

const AI_REPORT_JSON_KEYS =
  'JSON 顶层必须包含且不得为空的字段：freeSummary（中文 120–450 字，面向球迷；禁止「占位」「运维」「待补充」等元话语）、disclaimer（免责声明字符串）。' +
  'freeSummary 必须按此顺序写为四个小节（每节 2–4 句，段间仅用换行分隔，勿使用 Markdown 多级标题）：' +
  '（1）对阵背景与走势/实力对比基调，仅引用 dataAvailability 为 present 或可谨慎概括的 partial 层级；' +
  '（2）攻防与场面切入点，模型推断处须标「AI 推演」；' +
  '（3）关键球员/伤停或裁判天气等，若对应键为 missing 则单句说明不可用，禁止编造名单或数字；' +
  '（4）不确定性、风险与阅读提示，语气与 disclaimer 一致。' +
  'dashboardSummary：单独一条中文，≤120 字，概括数据完整度与模型倾向，不得与 freeSummary 矛盾。';

const AI_REPORT_SYSTEM_WITH_STEWARD = `${AI_REPORT_BASE_SYSTEM}\n\n${AI_REPORT_JSON_KEYS}\n\n${LLM_DATA_STEWARD_ADDENDUM}`;

@Injectable()
export class AiReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deepseek: DeepseekService,
    private readonly dossier: MatchLlmDossierService,
  ) {}

  /**
   * @param opts.skipExternalPreparation 为 true 时不再请求 FD/公开来源（依赖调用方已写入库，如管线末尾）。
   */
  async generate(
    matchId: string,
    opts?: { skipExternalPreparation?: boolean },
  ) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        tournament: true,
        competition: true,
        homeTeam: true,
        awayTeam: true,
        activePrediction: true,
        teamSnapshots: true,
        playerSnapshots: { include: { player: true } },
      },
    });
    if (!match) throw new NotFoundException('Match not found');

    const enriched = opts?.skipExternalPreparation
      ? await this.dossier.buildDossier(matchId)
      : await this.dossier.prepareEnrichedDossier(matchId, {
          skipFdIntel: false,
          skipPublicFetch: false,
          publicFetchForce: false,
        });
    const userPrompt = this.dossier.formatForMatchReportPrompt(enriched, 14_000);

    const rawInput = {
      dossier: enriched,
      matchCore: {
        id: match.id,
        kickoffTime: match.kickoffTime,
        status: match.status,
        competitionCode: match.competition?.code,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
      },
      note: '赛前报告：先 FD+公开来源补强，再分层档案与 dataAvailability 入模',
    };

    const parsed = await this.deepseek.generateReportJson(AI_REPORT_SYSTEM_WITH_STEWARD, userPrompt);
    const fromModel =
      typeof parsed.freeSummary === 'string' && parsed.freeSummary.trim()
        ? parsed.freeSummary.trim()
        : '';
    const fromDash =
      typeof parsed.dashboardSummary === 'string' && parsed.dashboardSummary.trim()
        ? parsed.dashboardSummary.trim().slice(0, 2000)
        : '';
    const fromPred = match.activePrediction?.explanation?.trim()?.slice(0, 2000) ?? '';
    const rawFree =
      fromModel ||
      fromDash ||
      fromPred ||
      '赛前简报：结构化数据仍在补齐，可先结合下方模型概率阅读；建议在管理后台完成情报管线后重新生成报告。';
    const sum = sanitizeAiReportText(rawFree);
    const contentWarnings: string[] = [...sum.warnings];
    if (!fromModel) {
      contentWarnings.push('freeSummary_synthesized_not_from_model');
    }

    const pred = match.activePrediction;

    const report = await this.prisma.aiReport.create({
      data: {
        matchId,
        reportType: AiReportType.PRE_MATCH,
        predictionId: pred?.id ?? null,
        oddsSnapshotId: pred?.oddsSnapshotId ?? null,
        freeSummary: sum.text,
        dashboardSummary: parsed.dashboardSummary ?? null,
        refereeAnalysis: parsed.refereeAnalysis as object,
        weatherAnalysis: parsed.weatherAnalysis as object,
        playerProfiles: parsed.playerProfiles as object,
        tacticalScenarios: parsed.tacticalScenarios as object,
        fantasyAdvice: parsed.fantasyAdvice as object,
        historicalInsight: parsed.historicalInsight ?? null,
        headToHeadInsight: parsed.headToHeadInsight as object,
        expertVariables: parsed.expertVariables as object,
        socialGuide: parsed.socialGuide as object,
        sourceSummary: parsed.sourceSummary as object,
        disclaimer: parsed.disclaimer || DEFAULT_AI_DISCLAIMER,
        status: ReportStatus.DRAFT,
        rawInput: rawInput as object,
        rawOutput: parsed as object,
        contentWarnings: contentWarnings.length ? contentWarnings : undefined,
      },
    });

    await this.prisma.match.update({
      where: { id: matchId },
      data: { reportStatus: ReportStatus.DRAFT },
    });

    return report;
  }

  async publish(matchId: string, user: RequestUser) {
    if (user.role !== UserRole.ADMIN) {
      throw new BadRequestException('Admin only');
    }
    const draft = await this.prisma.aiReport.findFirst({
      where: {
        matchId,
        reportType: AiReportType.PRE_MATCH,
        status: ReportStatus.DRAFT,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!draft) throw new NotFoundException('No DRAFT pre-match report');

    if (draft.reportType !== AiReportType.PRE_MATCH) {
      throw new BadRequestException(
        'Post-match and live narrative reports must use approve after REVIEW',
      );
    }

    const check = validateReportBeforePublish({
      disclaimer: draft.disclaimer,
      freeSummary: draft.freeSummary,
    });
    if (!check.ok) {
      throw new BadRequestException(`无法发布: ${check.reasons.join(',')}`);
    }

    const published = await this.prisma.aiReport.update({
      where: { id: draft.id },
      data: {
        status: ReportStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });
    await this.prisma.match.update({
      where: { id: matchId },
      data: { reportStatus: ReportStatus.PUBLISHED },
    });
    return published;
  }

  list(matchId: string, reportType?: AiReportType) {
    return this.prisma.aiReport.findMany({
      where: {
        matchId,
        ...(reportType ? { reportType } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

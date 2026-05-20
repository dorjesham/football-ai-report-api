import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataQuality, DataSourceType, RiskLevel } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { DeepseekService } from '../deepseek/deepseek.service';
import { LLM_DATA_STEWARD_ADDENDUM } from '../match-llm-dossier/llm-dossier-policy';
import { MatchLlmDossierService } from '../match-llm-dossier/match-llm-dossier.service';
import { shouldUseDeepseekMock } from '../common/utils/deepseek-env.util';
import { PrismaService } from '../prisma/prisma.service';

const PlayerIntelBatchSchema = z.object({
  players: z.array(
    z.object({
      playerId: z.string(),
      statusTag: z.string(),
      startProbability: z.number().min(0).max(100).optional(),
      fitnessAnalysis: z.string(),
      psychologyAnalysis: z.string(),
      matchupAnalysis: z.string(),
      weatherImpact: z.string(),
      fantasySuggestion: z.string(),
      aiSummary: z.string(),
    }),
  ),
});

@Injectable()
export class PlayerIntelligenceService {
  private readonly log = new Logger(PlayerIntelligenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly deepseek: DeepseekService,
    private readonly dossier: MatchLlmDossierService,
  ) {}

  private ruleBasedRow(snap: {
    playerId: string;
    teamId: string;
    expectedStartProbability?: number | null;
    riskLevel?: RiskLevel | null;
    fitnessScore?: number | null;
    matchupText?: string | null;
    predictedFantasyPoints?: number | null;
  }) {
    return {
      statusTag: '稳定输出',
      startProbability: Math.round(snap.expectedStartProbability ?? 70),
      riskLevel: snap.riskLevel ?? RiskLevel.MEDIUM,
      fitnessAnalysis: snap.fitnessScore
        ? `体能评分约 ${snap.fitnessScore}`
        : '暂无可靠公开数据',
      psychologyAnalysis: '基于公开信息的赛前观察，不构成投注建议。',
      matchupAnalysis: snap.matchupText || '暂无可靠公开数据',
      weatherImpact: '天气影响需结合临场信息。',
      fantasySuggestion: snap.predictedFantasyPoints
        ? `预测分约 ${snap.predictedFantasyPoints}`
        : '暂无可靠公开数据',
      aiSummary: '关键球员画像由规则与快照字段生成（未调用 DeepSeek）。',
      dataQuality: DataQuality.MODEL_ESTIMATED,
      dataSource: DataSourceType.MODEL,
    };
  }

  async generate(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { playerSnapshots: { include: { player: true } } },
    });
    if (!match) throw new NotFoundException('Match not found');

    const useMock = shouldUseDeepseekMock(this.config);
    let aiRows: Map<string, z.infer<typeof PlayerIntelBatchSchema>['players'][0]> | null =
      null;

    if (!useMock && match.playerSnapshots.length > 0) {
      try {
        const dossier = await this.dossier.buildDossier(matchId);
        const dossierBlock = this.dossier.formatCompactForPrompt(dossier);
        const system = [
          '你是足球赛前球员情报助手。只输出合法 JSON，players 数组与输入 playerId 一一对应。',
          '不得编造伤病等未提供事实；dataAvailability 为 missing 的维度不得虚构细节。',
          '不提供投注建议。中文。',
          '',
          LLM_DATA_STEWARD_ADDENDUM,
        ].join('\n');
        const user = `${dossierBlock}\n\n为以下每名球员生成情报字段（statusTag,startProbability,fitnessAnalysis,psychologyAnalysis,matchupAnalysis,weatherImpact,fantasySuggestion,aiSummary）：\n${JSON.stringify(
          match.playerSnapshots.map((s) => ({
            playerId: s.playerId,
            teamId: s.teamId,
            player: s.player
              ? {
                  nameCn: s.player.nameCn,
                  nameEn: s.player.nameEn,
                  avatarUrl: s.player.avatarUrl,
                }
              : null,
            expectedStartProbability: s.expectedStartProbability,
            riskLevel: s.riskLevel,
            fitnessScore: s.fitnessScore,
            matchupText: s.matchupText,
            predictedFantasyPoints: s.predictedFantasyPoints,
          })),
        ).slice(0, 12000)}`;
        const out = await this.deepseek.completeChatJson(
          system,
          user,
          PlayerIntelBatchSchema,
        );
        aiRows = new Map(out.players.map((p) => [p.playerId, p]));
      } catch (e) {
        this.log.warn(
          `DeepSeek 球员画像批处理失败，回退规则生成: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    const results = [];
    for (const snap of match.playerSnapshots) {
      const fromAi = aiRows?.get(snap.playerId);
      const base = this.ruleBasedRow(snap);
      const intel = await this.prisma.playerIntelligence.upsert({
        where: {
          matchId_playerId: { matchId, playerId: snap.playerId },
        },
        create: {
          matchId,
          playerId: snap.playerId,
          teamId: snap.teamId,
          statusTag: fromAi?.statusTag ?? base.statusTag,
          startProbability: fromAi?.startProbability ?? base.startProbability,
          riskLevel: base.riskLevel,
          fitnessAnalysis: fromAi?.fitnessAnalysis ?? base.fitnessAnalysis,
          psychologyAnalysis: fromAi?.psychologyAnalysis ?? base.psychologyAnalysis,
          matchupAnalysis: fromAi?.matchupAnalysis ?? base.matchupAnalysis,
          weatherImpact: fromAi?.weatherImpact ?? base.weatherImpact,
          fantasySuggestion: fromAi?.fantasySuggestion ?? base.fantasySuggestion,
          aiSummary: fromAi?.aiSummary ?? base.aiSummary,
          dataQuality: fromAi ? DataQuality.AI_GENERATED : base.dataQuality,
          dataSource: fromAi ? DataSourceType.DEEPSEEK : base.dataSource,
        },
        update: {
          statusTag: fromAi?.statusTag ?? base.statusTag,
          startProbability: fromAi?.startProbability ?? base.startProbability,
          riskLevel: base.riskLevel,
          fitnessAnalysis: fromAi?.fitnessAnalysis ?? base.fitnessAnalysis,
          psychologyAnalysis: fromAi?.psychologyAnalysis ?? base.psychologyAnalysis,
          matchupAnalysis: fromAi?.matchupAnalysis ?? base.matchupAnalysis,
          weatherImpact: fromAi?.weatherImpact ?? base.weatherImpact,
          fantasySuggestion: fromAi?.fantasySuggestion ?? base.fantasySuggestion,
          aiSummary: fromAi?.aiSummary ?? base.aiSummary,
          dataQuality: fromAi ? DataQuality.AI_GENERATED : base.dataQuality,
          dataSource: fromAi ? DataSourceType.DEEPSEEK : base.dataSource,
        },
      });
      results.push(intel);
    }
    return results;
  }

  list(matchId: string) {
    return this.prisma.playerIntelligence.findMany({
      where: { matchId },
      include: { player: true },
    });
  }
}

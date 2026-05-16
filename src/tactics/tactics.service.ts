import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataQuality, DataSourceType } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { DeepseekService } from '../ai-report/deepseek.service';
import { LLM_DATA_STEWARD_ADDENDUM } from '../match-llm-dossier/llm-dossier-policy';
import { MatchLlmDossierService } from '../match-llm-dossier/match-llm-dossier.service';
import { shouldUseDeepseekMock } from '../common/utils/deepseek-env.util';
import { PrismaService } from '../prisma/prisma.service';

const TacticsAiSchema = z.object({
  scenarios: z.array(
    z.object({
      scenarioType: z.string(),
      title: z.string(),
      probability: z.number().min(0).max(100),
      precondition: z.string(),
      process: z.string(),
      possibleScore: z.string().optional(),
      timeline: z.string(),
    }),
  ).min(2).max(6),
});

@Injectable()
export class TacticsService {
  private readonly log = new Logger(TacticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly deepseek: DeepseekService,
    private readonly dossier: MatchLlmDossierService,
  ) {}

  private buildFallbackScenarios(
    pred: { homeWinProbability: number; drawProbability: number; awayWinProbability: number } | null,
  ) {
    return [
      {
        scenarioType: 'HOME_ADV',
        title: '剧本A：主队场面占优',
        probability: pred?.homeWinProbability ?? 40,
        precondition: '主队保持控球与压迫节奏',
        process: '基于模型概率的推演占位；不承诺赛果。',
        possibleScore: '—',
        timeline: '开场15分钟试探；中场调整；尾声体能下降变量',
      },
      {
        scenarioType: 'STALE',
        title: '剧本B：僵持局面',
        probability: pred?.drawProbability ?? 30,
        precondition: '双方防守组织到位',
        process: '节奏趋缓，机会碎片化。',
        possibleScore: '—',
        timeline: '60分钟后换人带来变量',
      },
      {
        scenarioType: 'AWAY_UPSET',
        title: '剧本C：客队反击威胁',
        probability: pred?.awayWinProbability ?? 30,
        precondition: '客队利用转换与定位球',
        process: '弱势方通过效率与偶然因素制造威胁。',
        possibleScore: '—',
        timeline: '反击窗口与定位球回合',
      },
    ];
  }

  async generate(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { activePrediction: true, teamSnapshots: true },
    });
    if (!match) throw new NotFoundException('Match not found');
    const pred = match.activePrediction;

    await this.prisma.tacticalScenario.deleteMany({ where: { matchId } });

    let scenarios = this.buildFallbackScenarios(pred);

    if (!shouldUseDeepseekMock(this.config)) {
      try {
        const dossier = await this.dossier.buildDossier(matchId);
        const dossierBlock = this.dossier.formatCompactForPrompt(dossier);
        const system = [
          '你是足球赛前战术沙盘助手。只输出合法 JSON 对象，含 scenarios 数组。',
          '不得编造未提供的球队数据；dataAvailability 为 missing 的维度不得写出具体统计或名单。',
          '不得提供投注建议或承诺赛果。中文输出。',
          '',
          LLM_DATA_STEWARD_ADDENDUM,
        ].join('\n');
        const user = `${dossierBlock}\n\n请根据以下结构化数据生成 2～5 条战术剧本（scenarios）：\n${JSON.stringify({
          matchId: match.id,
          prediction: pred,
          teamSnapshots: match.teamSnapshots,
        }).slice(0, 12000)}`;
        const out = await this.deepseek.completeChatJson(system, user, TacticsAiSchema);
        scenarios = out.scenarios.map((s) => ({
          ...s,
          possibleScore: s.possibleScore ?? '—',
        }));
      } catch (e) {
        this.log.warn(
          `DeepSeek 战术生成失败，使用占位剧本: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    const created = [];
    for (const s of scenarios) {
      created.push(
        await this.prisma.tacticalScenario.create({
          data: {
            matchId,
            scenarioType: s.scenarioType,
            title: s.title,
            probability: Math.round(s.probability),
            precondition: s.precondition,
            process: s.process,
            possibleScore: s.possibleScore ?? '—',
            timeline: s.timeline,
            dataQuality: DataQuality.AI_GENERATED,
            dataSource: DataSourceType.DEEPSEEK,
          },
        }),
      );
    }
    return created;
  }

  list(matchId: string) {
    return this.prisma.tacticalScenario.findMany({ where: { matchId } });
  }
}

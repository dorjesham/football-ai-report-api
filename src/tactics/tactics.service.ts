import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataQuality, DataSourceType, MatchStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { DeepseekService } from '../deepseek/deepseek.service';
import { buildTacticsSandboxV2SystemPrompt } from '../ai-report/prompts/tactics-sandbox-v2.system';
import { TacticalSandboxV2Schema } from '../ai-report/schemas/tactics-sandbox-v2.schema';
import { MatchLlmDossierService } from '../match-llm-dossier/match-llm-dossier.service';
import { shouldUseDeepseekMock } from '../common/utils/deepseek-env.util';
import { PrismaService } from '../prisma/prisma.service';

type ScenarioRow = {
  scenarioType: string;
  title: string;
  probability: number;
  precondition: string;
  process: string;
  possibleScore?: string;
  timeline: string;
};

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
  ): ScenarioRow[] {
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

  private async persistScenarios(matchId: string, scenarios: ScenarioRow[]) {
    await this.prisma.tacticalScenario.deleteMany({ where: { matchId } });
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

  async generate(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { activePrediction: true, teamSnapshots: true, homeTeam: true, awayTeam: true },
    });
    if (!match) throw new NotFoundException('Match not found');
    const pred = match.activePrediction;
    const phase =
      match.status === MatchStatus.FINISHED ? 'post_match' : 'pre_match';

    let scenarios = this.buildFallbackScenarios(pred);
    let sandboxRecord: Awaited<ReturnType<typeof this.prisma.matchTacticalSandbox.upsert>> | null =
      null;

    const useV2 = this.config.get<boolean>('enableTacticsSandboxV2') !== false;

    if (!shouldUseDeepseekMock(this.config)) {
      try {
        const dossier = await this.dossier.buildDossier(matchId);
        const dossierBlock = this.dossier.formatCompactForPrompt(dossier);

        if (useV2) {
          const system = buildTacticsSandboxV2SystemPrompt(
            phase as 'pre_match' | 'post_match',
          );
          const user = `${dossierBlock}\n\n【schema】输出 JSON 须含：asciiDiagrams[], inPossession, outOfPossession, transitions, keyMatchups[], attackPatterns[], defensivePlan, risksAndAdjustments[], conclusion, scenarios[]（2～5条，字段同 scenarioType/title/probability/precondition/process/timeline）。\n\n${JSON.stringify(
            {
              matchId: match.id,
              phase,
              home: match.homeTeam.nameCn,
              away: match.awayTeam.nameCn,
              prediction: pred,
              teamSnapshots: match.teamSnapshots,
            },
          ).slice(0, 12000)}`;

          const out = await this.deepseek.completeChatJson(system, user, TacticalSandboxV2Schema);
          scenarios = out.scenarios.map((s) => ({
            ...s,
            possibleScore: s.possibleScore ?? '—',
          }));

          sandboxRecord = await this.prisma.matchTacticalSandbox.upsert({
            where: { matchId },
            create: {
              matchId,
              phase,
              contentJson: out as object,
              rawInput: { dossier: { matchId, phase } } as object,
              rawOutput: out as object,
            },
            update: {
              phase,
              contentJson: out as object,
              rawInput: { dossier: { matchId, phase } } as object,
              rawOutput: out as object,
            },
          });
        }
      } catch (e) {
        this.log.warn(
          `DeepSeek 战术生成失败，使用占位剧本: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    const legacy = await this.persistScenarios(matchId, scenarios);
    return { legacy, sandbox: sandboxRecord };
  }

  async list(matchId: string) {
    const [legacy, sandbox] = await Promise.all([
      this.prisma.tacticalScenario.findMany({ where: { matchId } }),
      this.prisma.matchTacticalSandbox.findUnique({ where: { matchId } }),
    ]);
    return { legacy, sandbox };
  }

  getSandbox(matchId: string) {
    return this.prisma.matchTacticalSandbox.findUnique({ where: { matchId } });
  }
}

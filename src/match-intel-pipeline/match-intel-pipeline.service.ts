import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PipelineRunStatus, Prisma } from '@prisma/client';
import { AiReportService } from '../ai-report/ai-report.service';
import { DeepseekService } from '../ai-report/deepseek.service';
import { shouldUseDeepseekMock } from '../common/utils/deepseek-env.util';
import { FantasyService } from '../fantasy/fantasy.service';
import { FootballDataService } from '../football-data/football-data.service';
import { HeadToHeadService } from '../head-to-head/head-to-head.service';
import { PlayerIntelligenceService } from '../player-intelligence/player-intelligence.service';
import { PredictionService } from '../prediction/prediction.service';
import { PrismaService } from '../prisma/prisma.service';
import { PublicSourcesService } from '../public-sources/public-sources.service';
import { SocialGuideService } from '../social-guide/social-guide.service';
import { TacticsService } from '../tactics/tactics.service';
import { WeatherService } from '../weather/weather.service';
import { MatchAfFactsSyncService } from '../api-football/match-af-facts-sync.service';
import { MatchAfPreMatchSnapshotService } from '../api-football/match-af-pre-match-snapshot.service';
import {
  shouldRunAfMatchFactsSync,
  shouldRunFootballDataIntelSync,
} from './match-intel-sync-routing.util';

export type MatchIntelPipelineOptions = {
  /** 任一步失败后是否中止后续步骤 */
  stopOnFailure?: boolean;
  skipAfFacts?: boolean;
  skipAfPreMatchSnapshots?: boolean;
  skipFdIntel?: boolean;
  skipPublicSources?: boolean;
  skipWeather?: boolean;
  skipDeepseekSmoke?: boolean;
  skipAiReport?: boolean;
};

export type PipelineStepRecord = {
  id: string;
  status: 'OK' | 'SKIPPED' | 'FAILED';
  durationMs: number;
  detail?: string;
};

export type MatchIntelPipelineResult = {
  runId: string;
  matchId: string;
  status: PipelineRunStatus;
  deepseekReal: boolean;
  deepseekSmoke?: { ok: boolean; latencyMs: number; error?: string };
  steps: PipelineStepRecord[];
  summary: string;
};

@Injectable()
export class MatchIntelPipelineService {
  private readonly log = new Logger(MatchIntelPipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly footballData: FootballDataService,
    private readonly publicSources: PublicSourcesService,
    private readonly weather: WeatherService,
    private readonly prediction: PredictionService,
    private readonly playerIntel: PlayerIntelligenceService,
    private readonly tactics: TacticsService,
    private readonly fantasy: FantasyService,
    private readonly h2h: HeadToHeadService,
    private readonly social: SocialGuideService,
    private readonly aiReport: AiReportService,
    private readonly deepseek: DeepseekService,
    private readonly matchAfFacts: MatchAfFactsSyncService,
    private readonly preMatchSnapshots: MatchAfPreMatchSnapshotService,
  ) {}

  /**
   * Phase C：按固定顺序跑满单场情报依赖的写入步骤；各步独立 try/catch，默认失败不阻断后续。
   * 结果写入 {@link MatchPipelineRun} 便于审计与联调。
   */
  async runFull(
    matchId: string,
    opts?: MatchIntelPipelineOptions,
  ): Promise<MatchIntelPipelineResult> {
    const m = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!m) throw new NotFoundException('Match not found');

    const stopOnFailure = opts?.stopOnFailure === true;
    const deepseekReal = !shouldUseDeepseekMock(this.config);
    const steps: PipelineStepRecord[] = [];
    let deepseekSmoke: MatchIntelPipelineResult['deepseekSmoke'];
    let aborted = false;

    const runRow = await this.prisma.matchPipelineRun.create({
      data: {
        matchId,
        kind: 'INTEL_FULL_V1',
        status: PipelineRunStatus.RUNNING,
        deepseekReal,
        steps: [],
      },
    });

    const persistSteps = async () => {
      await this.prisma.matchPipelineRun.update({
        where: { id: runRow.id },
        data: { steps: steps as unknown as Prisma.InputJsonValue },
      });
    };

    /** 可选：将精简 JSON 写入步骤 detail（如 af_match_facts 的 endpoints / statistics 行数） */
    type StepRunResult = { stepDetail?: string };

    const runStep = async (
      id: string,
      optional: boolean,
      fn: () => Promise<unknown>,
    ): Promise<boolean> => {
      const t0 = Date.now();
      try {
        const result = await fn();
        const stepDetail =
          result &&
          typeof result === 'object' &&
          'stepDetail' in result &&
          typeof (result as StepRunResult).stepDetail === 'string' ?
            (result as StepRunResult).stepDetail
          : undefined;
        steps.push({
          id,
          status: 'OK',
          durationMs: Date.now() - t0,
          ...(stepDetail ? { detail: stepDetail.slice(0, 2000) } : {}),
        });
        await persistSteps();
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(`[pipeline ${matchId}] ${id} FAILED: ${msg}`);
        steps.push({
          id,
          status: 'FAILED',
          durationMs: Date.now() - t0,
          detail: msg.slice(0, 2000),
        });
        await persistSteps();
        if (!optional && stopOnFailure) {
          aborted = true;
          return false;
        }
        return true;
      }
    };

    type StepDef = {
      id: string;
      optional: boolean;
      skip?: boolean;
      run: () => Promise<unknown>;
    };

    const stepDefs: StepDef[] = [
      {
        id: 'deepseek_smoke',
        optional: true,
        skip: opts?.skipDeepseekSmoke === true,
        run: async () => {
          const ping = await this.deepseek.smokePing();
          deepseekSmoke = ping;
          if (!ping.ok) {
            throw new Error(ping.error || 'DeepSeek smoke failed');
          }
        },
      },
      {
        id: 'af_match_facts',
        optional: true,
        skip: opts?.skipAfFacts === true,
        run: async () => {
          if (!shouldRunAfMatchFactsSync(m)) {
            return {
              stepDetail: JSON.stringify({
                skipped: true,
                reason: 'externalId not af-f-{id}',
              }),
            };
          }
          const key = this.config.get<string>('apiFootballApiKey')?.trim();
          if (!key) {
            this.log.warn(`[pipeline ${matchId}] af_match_facts: skip (no API_FOOTBALL_API_KEY)`);
            return {
              stepDetail: JSON.stringify({
                skipped: true,
                reason: 'no API_FOOTBALL_API_KEY',
              }),
            };
          }
          const out = await this.matchAfFacts.syncByMatchId(matchId, { delayMs: 400 });
          this.log.log(`[pipeline ${matchId}] af_match_facts OK fixture=${out.fixtureId}`);
          return {
            stepDetail: JSON.stringify({
              endpoints: ['fixture', 'lineups', 'events', 'statistics'],
              statisticsEmpty: out.detail.statisticsRows === 0,
              ...out.detail,
            }),
          };
        },
      },
      {
        id: 'fd_intel',
        optional: true,
        skip: opts?.skipFdIntel === true,
        run: async () => {
          if (!shouldRunFootballDataIntelSync(m)) {
            this.log.warn(
              `[pipeline ${matchId}] fd_intel: skip (non-Football-Data primary; use af_match_facts for af-f-*)`,
            );
            return;
          }
          await this.footballData.syncMatchIntelFromFootballData(matchId);
        },
      },
      {
        id: 'public_sources',
        optional: true,
        skip: opts?.skipPublicSources === true,
        run: () => this.publicSources.fetchForMatch(matchId, { force: false }),
      },
      {
        id: 'weather',
        optional: true,
        skip: opts?.skipWeather === true,
        run: () => this.weather.syncForMatch(matchId),
      },
      {
        id: 'af_pre_match_snapshots',
        optional: true,
        skip: opts?.skipAfPreMatchSnapshots === true,
        run: async () => {
          if (!shouldRunAfMatchFactsSync(m)) {
            return {
              stepDetail: JSON.stringify({ skipped: true, reason: 'non af-f-*' }),
            };
          }
          const key = this.config.get<string>('apiFootballApiKey')?.trim();
          if (!key) {
            return {
              stepDetail: JSON.stringify({ skipped: true, reason: 'no API_FOOTBALL_API_KEY' }),
            };
          }
          const out = await this.preMatchSnapshots.syncByMatchId(matchId, {
            delayMs: 400,
            force: true,
          });
          return {
            stepDetail: JSON.stringify({
              teamSnapshots: out.teamSnapshots,
              playerSnapshots: out.playerSnapshots,
              warnings: out.warnings.slice(0, 5),
              ...out.detail,
            }),
          };
        },
      },
      {
        id: 'prediction',
        optional: false,
        run: () => this.prediction.generateForMatch(matchId).then(() => undefined),
      },
      {
        id: 'player_intelligence',
        optional: false,
        run: () => this.playerIntel.generate(matchId).then(() => undefined),
      },
      {
        id: 'tactics',
        optional: false,
        run: () => this.tactics.generate(matchId).then(() => undefined),
      },
      {
        id: 'fantasy',
        optional: false,
        run: () => this.fantasy.generate(matchId).then(() => undefined),
      },
      {
        id: 'head_to_head',
        optional: false,
        run: () => this.h2h.generate(matchId).then(() => undefined),
      },
      {
        id: 'social_guide',
        optional: false,
        run: () => this.social.generate(matchId).then(() => undefined),
      },
      {
        id: 'ai_report',
        optional: true,
        skip: opts?.skipAiReport === true,
        run: () =>
          this.aiReport.generate(matchId, { skipExternalPreparation: true }).then(() => undefined),
      },
    ];

    for (const def of stepDefs) {
      if (aborted) break;
      if (def.skip) {
        steps.push({ id: def.id, status: 'SKIPPED', durationMs: 0, detail: 'skipped by option' });
        await persistSteps();
        continue;
      }
      if (def.id === 'deepseek_smoke' && shouldUseDeepseekMock(this.config)) {
        steps.push({
          id: def.id,
          status: 'SKIPPED',
          durationMs: 0,
          detail: 'ENABLE_MOCK_DEEPSEEK 或无 DEEPSEEK_API_KEY',
        });
        await persistSteps();
        continue;
      }
      const ok = await runStep(def.id, def.optional, def.run);
      if (!ok) break;
    }

    const failed = steps.filter((s) => s.status === 'FAILED');
    const status = aborted
      ? PipelineRunStatus.FAILED
      : failed.length > 0
        ? PipelineRunStatus.PARTIAL
        : PipelineRunStatus.SUCCEEDED;
    const summary = `${steps.length} 步：${failed.length} 失败，${steps.filter((s) => s.status === 'SKIPPED').length} 跳过`;

    await this.prisma.matchPipelineRun.update({
      where: { id: runRow.id },
      data: {
        status,
        summary,
        finishedAt: new Date(),
        steps: steps as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      runId: runRow.id,
      matchId,
      status,
      deepseekReal,
      deepseekSmoke,
      steps,
      summary,
    };
  }
}

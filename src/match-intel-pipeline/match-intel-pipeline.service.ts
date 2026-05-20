import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PipelineRunStatus, Prisma } from '@prisma/client';
import { AiReportService } from '../ai-report/ai-report.service';
import { PreMatchIntelLongService } from '../ai-report/pre-match-intel-long.service';
import { PostMatchTacticalLongService } from '../ai-report/post-match-tactical-long.service';
import { DeepseekService } from '../deepseek/deepseek.service';
import { shouldUseDeepseekMock } from '../common/utils/deepseek-env.util';
import { FantasyService } from '../fantasy/fantasy.service';
import { FootballDataService } from '../football-data/football-data.service';
import { HeadToHeadService } from '../head-to-head/head-to-head.service';
import { PlayerIntelligenceService } from '../player-intelligence/player-intelligence.service';
import { PrismaService } from '../prisma/prisma.service';
import { PublicSourcesService } from '../public-sources/public-sources.service';
import { SocialGuideService } from '../social-guide/social-guide.service';
import { TacticsService } from '../tactics/tactics.service';
import { WeatherService } from '../weather/weather.service';
import { AfSyncOrchestrator } from '../api-football/af-sync-orchestrator.service';
import { MatchAfPreMatchSnapshotService } from '../api-football/match-af-pre-match-snapshot.service';
import { MatchOddsSnapshotService } from '../api-football/match-odds-snapshot.service';
import { resolvePreMatchPhase } from '../common/utils/pre-match-phase.util';
import { MatchCacheInvalidationService } from '../matches/match-cache-invalidation.service';
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
  /** v2：跳过 MatchPrediction 管线（官方预测改读 MatchAfRawBundle） */
  skipPrediction?: boolean;
  skipFantasy?: boolean;
  skipHeadToHead?: boolean;
  /** 仅跑 AF Raw 全量同步 */
  afRawOnly?: boolean;
  /** 仅跑 DeepSeek / 分析步骤 */
  analysisOnly?: boolean;
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
    private readonly playerIntel: PlayerIntelligenceService,
    private readonly tactics: TacticsService,
    private readonly fantasy: FantasyService,
    private readonly h2h: HeadToHeadService,
    private readonly social: SocialGuideService,
    private readonly aiReport: AiReportService,
    private readonly deepseek: DeepseekService,
    private readonly afSync: AfSyncOrchestrator,
    private readonly preMatchSnapshots: MatchAfPreMatchSnapshotService,
    private readonly oddsSnapshots: MatchOddsSnapshotService,
    private readonly cacheInvalidation: MatchCacheInvalidationService,
    private readonly preMatchIntelLong: PreMatchIntelLongService,
    private readonly postMatchTacticalLong: PostMatchTacticalLongService,
  ) {}

  /**
   * Phase C：按固定顺序跑满单场情报依赖的写入步骤；各步独立 try/catch，默认失败不阻断后续。
   * 结果写入 {@link MatchPipelineRun} 便于审计与联调。
   */
  async runAfRawFull(matchId: string) {
    return this.afSync.syncSingleMatchFull(matchId, { force: true });
  }

  async runAnalysisGenerate(
    matchId: string,
    opts?: Omit<MatchIntelPipelineOptions, 'afRawOnly' | 'analysisOnly'>,
  ) {
    return this.runFull(matchId, {
      ...opts,
      skipAfFacts: true,
      skipAfPreMatchSnapshots: true,
      skipPrediction: true,
      skipFantasy: true,
      skipHeadToHead: true,
      skipFdIntel: true,
      skipPublicSources: true,
      skipWeather: true,
      analysisOnly: true,
    });
  }

  async runFull(
    matchId: string,
    opts?: MatchIntelPipelineOptions,
  ): Promise<MatchIntelPipelineResult> {
    const m = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!m) throw new NotFoundException('Match not found');

    if (opts?.afRawOnly) {
      await this.runAfRawFull(matchId);
      return {
        runId: 'af-raw-only',
        matchId,
        status: PipelineRunStatus.SUCCEEDED,
        deepseekReal: !shouldUseDeepseekMock(this.config),
        steps: [{ id: 'af_raw_full', status: 'OK', durationMs: 0 }],
        summary: 'af_raw_full only',
      };
    }

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

    const analysisOnly = opts?.analysisOnly === true;

    const stepDefs: StepDef[] = [
      {
        id: 'af_raw_full',
        optional: true,
        skip: analysisOnly || opts?.skipAfFacts === true,
        run: async () => {
          if (this.config.get<boolean>('enableAfRawBundle') === false) {
            return { stepDetail: JSON.stringify({ skipped: true, reason: 'bundle disabled' }) };
          }
          const out = await this.afSync.syncSingleMatchFull(matchId, { delayMs: 400 });
          return { stepDetail: JSON.stringify({ fixtureId: out.fixtureId, endpoints: out.endpoints }) };
        },
      },
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
        id: 'fd_intel',
        optional: true,
        skip:
          opts?.skipFdIntel === true ||
          this.config.get<boolean>('enableFootballData') !== true,
        run: async () => {
          const fdEnabled = this.config.get<boolean>('enableFootballData') === true;
          if (!shouldRunFootballDataIntelSync(m, fdEnabled)) {
            return {
              stepDetail: JSON.stringify({
                skipped: true,
                reason: 'Football-Data disabled or non-FD match',
              }),
            };
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
          const phase = resolvePreMatchPhase(new Date(), m.kickoffTime);
          const out = await this.preMatchSnapshots.syncByMatchId(matchId, {
            delayMs: 400,
            force: true,
            phase,
          });
          return {
            stepDetail: JSON.stringify({
              phase,
              teamSnapshots: out.teamSnapshots,
              playerSnapshots: out.playerSnapshots,
              warnings: out.warnings.slice(0, 5),
              ...out.detail,
            }),
          };
        },
      },
      {
        id: 'odds_snapshots',
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
          const phase = resolvePreMatchPhase(new Date(), m.kickoffTime);
          const results: Record<string, string> = {};
          for (const p of ['T24', 'T1'] as const) {
            try {
              const out = await this.oddsSnapshots.captureByMatchId(matchId, p, {
                force: p !== phase,
              });
              results[p] = out.skipped ? 'skipped' : 'ok';
            } catch (e) {
              results[p] = e instanceof Error ? e.message : String(e);
            }
          }
          return { stepDetail: JSON.stringify({ primaryPhase: phase, results }) };
        },
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
        optional: true,
        skip: opts?.skipFantasy === true || analysisOnly,
        run: () => this.fantasy.generate(matchId).then(() => undefined),
      },
      {
        id: 'head_to_head',
        optional: true,
        skip: opts?.skipHeadToHead === true || analysisOnly,
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
      {
        id: 'pre_match_intel_long',
        optional: true,
        skip: this.config.get<boolean>('enablePreMatchIntelLong') !== true,
        run: () => this.preMatchIntelLong.generate(matchId, { skipExternalPreparation: true }).then(() => undefined),
      },
      {
        id: 'post_match_tactical_long',
        optional: true,
        skip: this.config.get<boolean>('enablePostMatchTacticalLong') !== true,
        run: () => this.postMatchTacticalLong.generate(matchId).then(() => undefined),
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

    try {
      await this.cacheInvalidation.invalidateAfterMatchDataChange(matchId);
    } catch (e) {
      this.log.warn(
        `[pipeline ${matchId}] cache invalidate failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

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

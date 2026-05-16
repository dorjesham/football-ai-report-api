import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PredictionService } from '../prediction/prediction.service';
import { MatchIntelPipelineService } from '../match-intel-pipeline/match-intel-pipeline.service';

export type AutoIntelRunMode = 'prediction' | 'full';

export type AutoIntelBatchParams = {
  mode: AutoIntelRunMode;
  lookaheadHours: number;
  lookbackHours: number;
  maxMatches: number;
  delayMs: number;
  /** full 模式下是否跑 AI 报告草稿（默认 false，避免定时任务过重） */
  skipAiReport: boolean;
  /** 调用来源，写入 ApiLog */
  source: 'cron' | 'admin-api' | 'admin-view';
};

export type AutoIntelBatchResult = {
  mode: AutoIntelRunMode;
  lookaheadHours: number;
  lookbackHours: number;
  candidates: number;
  attempted: number;
  succeeded: number;
  failed: { matchId: string; error: string }[];
  matchIds: string[];
};

@Injectable()
export class AutoIntelBatchService {
  private readonly log = new Logger(AutoIntelBatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly prediction: PredictionService,
    private readonly pipeline: MatchIntelPipelineService,
  ) {}

  /**
   * 选取：未来 lookahead 小时内、且开球不早于 lookback 小时前（避免远古 SCHEDULED），
   * 状态 SCHEDULED/LIVE，且尚无 MatchPrediction 的比赛。
   */
  async pickCandidateMatchIds(params: {
    lookaheadHours: number;
    lookbackHours: number;
    maxMatches: number;
  }): Promise<string[]> {
    const now = Date.now();
    const until = new Date(now + params.lookaheadHours * 3600_000);
    const since = new Date(now - params.lookbackHours * 3600_000);
    const rows = await this.prisma.match.findMany({
      where: {
        status: { in: [MatchStatus.SCHEDULED, MatchStatus.LIVE] },
        kickoffTime: { gte: since, lte: until },
        activePredictionId: null,
      },
      select: { id: true },
      orderBy: { kickoffTime: 'asc' },
      take: params.maxMatches,
    });
    return rows.map((r) => r.id);
  }

  async countCandidates(params: {
    lookaheadHours: number;
    lookbackHours: number;
  }): Promise<number> {
    const now = Date.now();
    const until = new Date(now + params.lookaheadHours * 3600_000);
    const since = new Date(now - params.lookbackHours * 3600_000);
    return this.prisma.match.count({
      where: {
        status: { in: [MatchStatus.SCHEDULED, MatchStatus.LIVE] },
        kickoffTime: { gte: since, lte: until },
        activePredictionId: null,
      },
    });
  }

  async runBatch(params: AutoIntelBatchParams): Promise<AutoIntelBatchResult> {
    const matchIds = await this.pickCandidateMatchIds({
      lookaheadHours: params.lookaheadHours,
      lookbackHours: params.lookbackHours,
      maxMatches: params.maxMatches,
    });
    const failed: { matchId: string; error: string }[] = [];
    let succeeded = 0;

    for (let i = 0; i < matchIds.length; i++) {
      const matchId = matchIds[i]!;
      try {
        if (params.mode === 'prediction') {
          await this.prediction.generateForMatch(matchId);
        } else {
          await this.pipeline.runFull(matchId, {
            stopOnFailure: false,
            skipAiReport: params.skipAiReport !== false,
          });
        }
        succeeded += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(`[auto-intel] ${matchId} (${params.mode}): ${msg}`);
        failed.push({ matchId, error: msg.slice(0, 500) });
      }
      if (i < matchIds.length - 1 && params.delayMs > 0) {
        await new Promise((r) => setTimeout(r, params.delayMs));
      }
    }

    const result: AutoIntelBatchResult = {
      mode: params.mode,
      lookaheadHours: params.lookaheadHours,
      lookbackHours: params.lookbackHours,
      candidates: matchIds.length,
      attempted: matchIds.length,
      succeeded,
      failed,
      matchIds,
    };

    await this.logApi(
      params.source,
      result,
      `${params.mode} ok=${succeeded} fail=${failed.length} candidates=${matchIds.length}`,
    );
    return result;
  }

  /**
   * Cron 入口：需 ENABLE_CRON_SYNC=true，且 AUTO_INTEL_CRON_MODE 为 prediction | full。
   */
  async runScheduledTick(): Promise<AutoIntelBatchResult | null> {
    if (this.config.get<boolean>('enableCronSync') !== true) {
      return null;
    }
    const modeRaw = (this.config.get<string>('autoIntelCronMode') || 'off').toLowerCase();
    if (modeRaw !== 'prediction' && modeRaw !== 'full') {
      return null;
    }
    const mode = modeRaw as AutoIntelRunMode;
    const lookaheadHours = this.config.get<number>('autoIntelLookaheadHours') ?? 72;
    const lookbackHours = this.config.get<number>('autoIntelLookbackHours') ?? 12;
    const maxMatches = this.config.get<number>('autoIntelMaxPerTick') ?? 8;
    const delayMs = this.config.get<number>('autoIntelDelayMs') ?? 2500;
    const skipAiReport = this.config.get<boolean>('autoIntelFullIncludeAiReport') !== true;

    return this.runBatch({
      mode,
      lookaheadHours,
      lookbackHours,
      maxMatches,
      delayMs,
      skipAiReport,
      source: 'cron',
    });
  }

  private async logApi(source: string, result: AutoIntelBatchResult, message: string) {
    try {
      await this.prisma.apiLog.create({
        data: {
          provider: 'auto-intel',
          endpoint: source,
          method: 'AUTO_INTEL',
          statusCode: result.failed.length ? 207 : 200,
          success: result.failed.length === 0,
          message: `${message} | ${JSON.stringify({ matchIds: result.matchIds, failed: result.failed })}`.slice(
            0,
            65000,
          ),
        },
      });
    } catch (e) {
      this.log.warn(`apiLog: ${String(e)}`);
    }
  }
}

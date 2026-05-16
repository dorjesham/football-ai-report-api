import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchStatus, ReportStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiReportService } from './ai-report.service';

export type AutoAiReportBatchResult = {
  lookaheadHours: number;
  lookbackHours: number;
  minLeadMinutes: number;
  requirePrediction: boolean;
  skipExternalPreparation: boolean;
  candidates: number;
  attempted: number;
  succeeded: number;
  failed: { matchId: string; error: string }[];
  matchIds: string[];
};

@Injectable()
export class AutoAiReportBatchService {
  private readonly log = new Logger(AutoAiReportBatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly aiReport: AiReportService,
  ) {}

  /**
   * 选取：开球时间在 [now−lookback, now+lookahead] 内、SCHEDULED 需距开球至少 minLead；
   * LIVE 仍可选（已开球但尚无报告）；尚无 DRAFT/PUBLISHED AiReport；可选要求已有 MatchPrediction。
   */
  async pickCandidateMatchIds(params: {
    lookaheadHours: number;
    lookbackHours: number;
    minLeadMinutes: number;
    maxMatches: number;
    requirePrediction: boolean;
  }): Promise<string[]> {
    const now = Date.now();
    const until = new Date(now + params.lookaheadHours * 3600_000);
    const since = new Date(now - params.lookbackHours * 3600_000);
    const leadMs = params.minLeadMinutes * 60_000;
    const kickoffScheduledMin = new Date(now + leadMs);

    const rows = await this.prisma.match.findMany({
      where: {
        status: { in: [MatchStatus.SCHEDULED, MatchStatus.LIVE] },
        kickoffTime: { gte: since, lte: until },
        AND: [
          {
            OR: [
              { status: MatchStatus.LIVE },
              { status: MatchStatus.SCHEDULED, kickoffTime: { gte: kickoffScheduledMin } },
            ],
          },
          ...(params.requirePrediction
            ? [{ activePredictionId: { not: null } } as const]
            : []),
          {
            NOT: {
              aiReports: {
                some: {
                  status: { in: [ReportStatus.DRAFT, ReportStatus.PUBLISHED] },
                },
              },
            },
          },
        ],
      },
      select: { id: true },
      orderBy: { kickoffTime: 'asc' },
      take: params.maxMatches,
    });
    return rows.map((r) => r.id);
  }

  async runBatch(params: {
    lookaheadHours: number;
    lookbackHours: number;
    minLeadMinutes: number;
    maxMatches: number;
    delayMs: number;
    requirePrediction: boolean;
    skipExternalPreparation: boolean;
    source: 'cron' | 'admin-api';
  }): Promise<AutoAiReportBatchResult> {
    const matchIds = await this.pickCandidateMatchIds({
      lookaheadHours: params.lookaheadHours,
      lookbackHours: params.lookbackHours,
      minLeadMinutes: params.minLeadMinutes,
      maxMatches: params.maxMatches,
      requirePrediction: params.requirePrediction,
    });
    const failed: { matchId: string; error: string }[] = [];
    let succeeded = 0;

    for (let i = 0; i < matchIds.length; i++) {
      const matchId = matchIds[i]!;
      try {
        await this.aiReport.generate(matchId, {
          skipExternalPreparation: params.skipExternalPreparation,
        });
        succeeded += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(`[auto-ai-report] ${matchId}: ${msg}`);
        failed.push({ matchId, error: msg.slice(0, 500) });
      }
      if (i < matchIds.length - 1 && params.delayMs > 0) {
        await new Promise((r) => setTimeout(r, params.delayMs));
      }
    }

    const result: AutoAiReportBatchResult = {
      lookaheadHours: params.lookaheadHours,
      lookbackHours: params.lookbackHours,
      minLeadMinutes: params.minLeadMinutes,
      requirePrediction: params.requirePrediction,
      skipExternalPreparation: params.skipExternalPreparation,
      candidates: matchIds.length,
      attempted: matchIds.length,
      succeeded,
      failed,
      matchIds,
    };

    await this.logApi(params.source, result);
    return result;
  }

  /**
   * Cron 入口：需 ENABLE_CRON_SYNC=true 且 AUTO_AI_REPORT_CRON=true。
   */
  async runScheduledTick(): Promise<AutoAiReportBatchResult | null> {
    if (this.config.get<boolean>('enableCronSync') !== true) {
      return null;
    }
    if (this.config.get<boolean>('autoAiReportCronEnabled') !== true) {
      return null;
    }

    const lookaheadHours = this.config.get<number>('autoAiReportLookaheadHours') ?? 96;
    const lookbackHours = this.config.get<number>('autoAiReportLookbackHours') ?? 12;
    const minLeadMinutes = this.config.get<number>('autoAiReportMinLeadMinutes') ?? 120;
    const maxMatches = this.config.get<number>('autoAiReportMaxPerTick') ?? 3;
    const delayMs = this.config.get<number>('autoAiReportDelayMs') ?? 8000;
    const requirePrediction = this.config.get<boolean>('autoAiReportRequirePrediction') !== false;
    const skipExternalPreparation =
      this.config.get<boolean>('autoAiReportSkipExternalPreparation') === true;

    return this.runBatch({
      lookaheadHours,
      lookbackHours,
      minLeadMinutes,
      maxMatches,
      delayMs,
      requirePrediction,
      skipExternalPreparation,
      source: 'cron',
    });
  }

  private async logApi(source: string, result: AutoAiReportBatchResult) {
    const message = `ok=${result.succeeded} fail=${result.failed.length} candidates=${result.candidates} lookahead=${result.lookaheadHours}h requirePred=${result.requirePrediction} skipExt=${result.skipExternalPreparation}`;
    try {
      await this.prisma.apiLog.create({
        data: {
          provider: 'auto-ai-report',
          endpoint: source,
          method: 'AUTO_AI_REPORT',
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

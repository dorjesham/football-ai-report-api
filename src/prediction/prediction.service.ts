import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataQuality, DataSourceType, MatchStatus, Prisma } from '@prisma/client';
import {
  AF_PREDICTION_MODEL_VERSION,
  mapApiFootballPredictionsResponse,
} from '../api-football/af-prediction.mapper';
import { parseAfFixtureIdFromExternalId } from '../api-football/af-fixture-match-fields.util';
import { ApiFootballService } from '../api-football/api-football.service';
import { DeepseekService } from '../deepseek/deepseek.service';
import { PowerRatingService } from '../power-rating/power-rating.service';
import { MatchIntelFreshnessService } from '../match-intel/match-intel-freshness.service';
import { DisplayNameService } from '../localization/display-name.service';
import { PrismaService } from '../prisma/prisma.service';
import { matchPowerToWinProb } from './calculators/match-power-win-prob.util';
import { calculateWinProbabilities, recentFormToScore } from './calculators/win-probability.calculator';
import { calculateExpectedGoals } from './calculators/expected-goals.calculator';
import { calculateTempoIndex } from './calculators/tempo-index.calculator';
import { calculateUpsetIndex } from './calculators/upset-index.calculator';
import { buildPredictionMarkets, pickBestOddsSnapshot } from '../legacy/prediction-markets.builder';
import {
  computeInputsHash,
  shouldCreateNewVersion,
  shouldLockNow,
} from './prediction-version.util';

const MODEL_VERSION = 'v3';

export type PredictionProvider = 'af' | 'model' | 'auto';

export type GenerateForMatchOptions = {
  provider?: PredictionProvider;
  /** 管理端 sync：强制新版本/覆盖 */
  forceRefresh?: boolean;
  /** 覆盖配置，单场 AF 成功后润色文案 */
  enrichDeepseek?: boolean;
};

type PredictionWritePayload = {
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
  homeExpectedGoals: number;
  awayExpectedGoals: number;
  totalExpectedGoals: number;
  totalGoalsTrend: string | null;
  tempoIndex: number;
  upsetIndex: number;
  homeMatchPower: number | null;
  awayMatchPower: number | null;
  confidence: number;
  modelVersion: string;
  inputsHash: string;
  oddsSnapshotId: string | null;
  predictionMarkets: Prisma.InputJsonValue;
  factorBreakdown: Prisma.InputJsonValue;
  explanation: string;
  dataQuality: DataQuality;
  dataSource: DataSourceType;
};

@Injectable()
export class PredictionService {
  private readonly log = new Logger(PredictionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly powerRating: PowerRatingService,
    private readonly apiFootball: ApiFootballService,
    private readonly deepseek: DeepseekService,
    private readonly intelFreshness: MatchIntelFreshnessService,
    private readonly displayName: DisplayNameService,
  ) {}

  private isOlsEnabled(): boolean {
    return this.config.get<boolean>('enableOls') === true;
  }

  private isPredictionMarketsEnabled(): boolean {
    return this.config.get<boolean>('enablePredictionMarkets') === true;
  }

  private emptyPredictionMarkets(): Prisma.InputJsonValue {
    return {} as Prisma.InputJsonValue;
  }

  async generateForMatch(matchId: string, opts: GenerateForMatchOptions = {}) {
    const provider = opts.provider ?? this.defaultProvider();
    if (provider === 'model') {
      throw new UnprocessableEntityException({
        code: 'MODEL_PREDICTION_DISABLED',
        message: 'ELO/model prediction path removed; use provider=af',
      });
    }

    const af = await this.generateFromApiFootball(matchId, opts);
    if (af) return af;

    throw new UnprocessableEntityException({
      code: 'AF_PREDICTION_MISSING',
      matchId,
      message: 'API-Football predictions unavailable for this match',
    });
  }

  async generateFromApiFootball(
    matchId: string,
    opts: GenerateForMatchOptions = {},
  ) {
    const match = await this.loadMatchForPrediction(matchId);
    const fixtureId = parseAfFixtureIdFromExternalId(match.externalId);
    if (fixtureId == null) {
      throw new NotFoundException('Match is not af-f-* API-Football chain');
    }

    const pack = await this.apiFootball.getPredictions(fixtureId);
    if (pack.errorsText && !pack.response.length) {
      throw new UnprocessableEntityException({
        code: 'AF_PREDICTION_MISSING',
        matchId,
        fixtureId,
        detail: pack.errorsText,
      });
    }
    const mapped = mapApiFootballPredictionsResponse(pack.response);
    if (!mapped) {
      throw new UnprocessableEntityException({
        code: 'AF_PREDICTION_MISSING',
        matchId,
        fixtureId,
      });
    }

    let explanation = mapped.explanation;
    let factorBreakdown: Record<string, unknown> = { ...mapped.factorBreakdown };
    if (this.shouldEnrichDeepseek(opts)) {
      try {
        const enriched = await this.deepseek.enrichPredictionNarrative({
          homeTeam: this.displayName.resolveTeam(match.homeTeam).displayName,
          awayTeam: this.displayName.resolveTeam(match.awayTeam).displayName,
          explanation: mapped.explanation,
          homeWinProbability: mapped.homeWinProbability,
          drawProbability: mapped.drawProbability,
          awayWinProbability: mapped.awayWinProbability,
          advice: mapped.explanation,
        });
        explanation = enriched.explanation;
        if (enriched.narrativeCn) {
          factorBreakdown = { ...factorBreakdown, narrativeCn: enriched.narrativeCn };
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(`DeepSeek prediction enrich skipped: ${msg}`);
      }
    }

    const oddsSnapshot = pickBestOddsSnapshot(match.oddsSnapshots);
    const predictionMarkets =
      this.isPredictionMarketsEnabled() ?
        (buildPredictionMarkets({
          homeWinProbability: mapped.homeWinProbability,
          drawProbability: mapped.drawProbability,
          awayWinProbability: mapped.awayWinProbability,
          totalExpectedGoals: mapped.totalExpectedGoals,
          homeExpectedGoals: mapped.homeExpectedGoals,
          awayExpectedGoals: mapped.awayExpectedGoals,
          homeMatchPower: null,
          awayMatchPower: null,
          homeNameCn: match.homeTeam.nameCn,
          oddsSnapshot,
        }) as Prisma.InputJsonValue)
      : this.emptyPredictionMarkets();

    const inputsHash = computeInputsHash({
      modelVersion: AF_PREDICTION_MODEL_VERSION,
      afFixtureId: fixtureId,
      afRawHash: JSON.stringify(pack.response).slice(0, 200),
    });

    const payload: PredictionWritePayload = {
      homeWinProbability: mapped.homeWinProbability,
      drawProbability: mapped.drawProbability,
      awayWinProbability: mapped.awayWinProbability,
      homeExpectedGoals: mapped.homeExpectedGoals,
      awayExpectedGoals: mapped.awayExpectedGoals,
      totalExpectedGoals: mapped.totalExpectedGoals,
      totalGoalsTrend: mapped.totalGoalsTrend,
      tempoIndex: mapped.tempoIndex,
      upsetIndex: mapped.upsetIndex,
      homeMatchPower: null,
      awayMatchPower: null,
      confidence: mapped.confidence,
      modelVersion: AF_PREDICTION_MODEL_VERSION,
      inputsHash,
      oddsSnapshotId: oddsSnapshot?.id ?? null,
      predictionMarkets,
      factorBreakdown: factorBreakdown as Prisma.InputJsonValue,
      explanation,
      dataQuality: DataQuality.MODEL_ESTIMATED,
      dataSource: DataSourceType.API_FOOTBALL,
    };

    return this.persistPrediction(matchId, match, payload, opts);
  }

  /** @deprecated ELO/model path removed; use generateFromApiFootball only */
  async generateFromModel(_matchId: string, _opts: GenerateForMatchOptions = {}) {
    throw new UnprocessableEntityException({
      code: 'MODEL_PREDICTION_DISABLED',
      message: 'generateFromModel is no longer supported',
    });
  }

  private async loadMatchForPrediction(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeTeam: true,
        awayTeam: true,
        teamSnapshots: true,
        refereeSnapshot: { include: { referee: true } },
        weatherSnapshot: true,
        oddsSnapshots: { orderBy: { capturedAt: 'desc' } },
        activePrediction: true,
        predictions: { orderBy: { version: 'desc' }, take: 1 },
      },
    });
    if (!match) throw new NotFoundException('Match not found');
    return match;
  }

  private async persistPrediction(
    matchId: string,
    match: Awaited<ReturnType<PredictionService['loadMatchForPrediction']>>,
    payload: PredictionWritePayload,
    opts: GenerateForMatchOptions,
  ) {
    const latest = match.predictions[0] ?? match.activePrediction;
    const createNew =
      opts.forceRefresh === true || shouldCreateNewVersion(match, latest);
    const now = new Date();
    const lockAt =
      latest && !createNew && shouldLockNow(match, latest, now) ? now : undefined;

    let prediction;
    if (!latest || createNew) {
      const nextVersion = (latest?.version ?? 0) + 1;
      prediction = await this.prisma.matchPrediction.create({
        data: {
          matchId,
          version: nextVersion,
          lockedAt: lockAt ?? null,
          ...payload,
        },
      });
    } else {
      prediction = await this.prisma.matchPrediction.update({
        where: { id: latest.id },
        data: {
          ...payload,
          ...(lockAt ? { lockedAt: lockAt } : {}),
        },
      });
    }

    await this.prisma.match.update({
      where: { id: matchId },
      data: { activePredictionId: prediction.id },
    });

    await this.intelFreshness.refreshIntelContentHash(matchId);

    return prediction;
  }

  private defaultProvider(): PredictionProvider {
    const raw = (this.config.get<string>('predictionProvider') || 'auto').toLowerCase();
    if (raw === 'af' || raw === 'model' || raw === 'auto') return raw;
    return 'auto';
  }

  private shouldEnrichDeepseek(opts: GenerateForMatchOptions): boolean {
    if (opts.enrichDeepseek === true) return true;
    if (opts.enrichDeepseek === false) return false;
    return this.config.get<boolean>('enablePredictionDeepseekEnrich') === true;
  }

  /** 已结束场次：将未锁定的 active 预测固定为开赛前版本（供赛后核对猜对与否） */
  async lockFinishedPredictions(opts: {
    matchIds?: string[];
    maxMatches?: number;
    lookbackDays?: number;
  }) {
    const maxMatches = Math.min(500, Math.max(1, opts.maxMatches ?? 200));
    const lookbackDays = Math.min(365, Math.max(1, opts.lookbackDays ?? 90));
    const since = new Date(Date.now() - lookbackDays * 86_400_000);

    const where: Prisma.MatchWhereInput = {
      status: MatchStatus.FINISHED,
      activePredictionId: { not: null },
      activePrediction: { is: { lockedAt: null } },
    };
    if (opts.matchIds?.length) {
      where.id = { in: opts.matchIds };
    } else {
      where.kickoffTime = { gte: since };
    }

    const rows = await this.prisma.match.findMany({
      where,
      include: { activePrediction: true },
      orderBy: { kickoffTime: 'desc' },
      take: maxMatches,
    });

    let locked = 0;
    for (const row of rows) {
      const pred = row.activePrediction;
      if (!pred || pred.lockedAt != null) continue;
      const lockAt = row.kickoffTime <= new Date() ? row.kickoffTime : new Date();
      await this.prisma.matchPrediction.update({
        where: { id: pred.id },
        data: { lockedAt: lockAt },
      });
      locked += 1;
    }
    return { attempted: rows.length, locked };
  }

  async lockDuePredictions(maxMatches = 50) {
    const now = new Date();
    const rows = await this.prisma.match.findMany({
      where: {
        status: MatchStatus.SCHEDULED,
        activePredictionId: { not: null },
        kickoffTime: { lte: new Date(now.getTime() + 5 * 60_000) },
      },
      include: { activePrediction: true },
      take: maxMatches,
    });

    let locked = 0;
    for (const row of rows) {
      const pred = row.activePrediction;
      if (!pred || pred.lockedAt != null) continue;
      if (!shouldLockNow(row, pred, now)) continue;
      await this.prisma.matchPrediction.update({
        where: { id: pred.id },
        data: { lockedAt: now },
      });
      locked += 1;
    }
    return { attempted: rows.length, locked };
  }

  async listVersions(matchId: string) {
    return this.prisma.matchPrediction.findMany({
      where: { matchId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        lockedAt: true,
        inputsHash: true,
        oddsSnapshotId: true,
        modelVersion: true,
        homeWinProbability: true,
        drawProbability: true,
        awayWinProbability: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  private estimateConfidence(
    home: { goalsForAvg?: number | null } | undefined,
    away: { goalsForAvg?: number | null } | undefined,
  ) {
    let c = 72;
    if (!home?.goalsForAvg || !away?.goalsForAvg) c -= 15;
    return Math.max(35, Math.min(95, c));
  }
}

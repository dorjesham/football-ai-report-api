import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataQuality, DataSourceType, MatchStatus, Prisma } from '@prisma/client';
import { PowerRatingService } from '../power-rating/power-rating.service';
import { PrismaService } from '../prisma/prisma.service';
import { matchPowerToWinProb } from './calculators/match-power-win-prob.util';
import { calculateWinProbabilities, recentFormToScore } from './calculators/win-probability.calculator';
import { calculateExpectedGoals } from './calculators/expected-goals.calculator';
import { calculateTempoIndex } from './calculators/tempo-index.calculator';
import { calculateUpsetIndex } from './calculators/upset-index.calculator';
import { buildPredictionMarkets, pickBestOddsSnapshot } from './prediction-markets.builder';
import {
  computeInputsHash,
  shouldCreateNewVersion,
  shouldLockNow,
} from './prediction-version.util';

const MODEL_VERSION = 'v3';

@Injectable()
export class PredictionService {
  private readonly log = new Logger(PredictionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly powerRating: PowerRatingService,
  ) {}

  async generateForMatch(matchId: string) {
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

    const homeSnap = match.teamSnapshots.find((s) => s.isHome);
    const awaySnap = match.teamSnapshots.find((s) => !s.isHome);

    const homeElo = match.homeTeam.eloRating;
    const awayElo = match.awayTeam.eloRating;
    const homeAdvantageElo = this.config.get<number>('homeEloAdvantage') ?? 65;

    let ols: Awaited<ReturnType<PowerRatingService['syncFromMatch']>> = null;
    const warnings: string[] = [];
    try {
      ols = await this.powerRating.syncFromMatch(matchId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`OLS fallback: ${msg}`);
      this.log.warn(`OLS 战力同步跳过: ${msg}`);
    }

    let win: {
      homeWinProbability: number;
      drawProbability: number;
      awayWinProbability: number;
      factorBreakdown: Record<string, unknown>;
    };
    if (ols?.homeMatchPower != null && ols?.awayMatchPower != null) {
      win = matchPowerToWinProb({
        homeMatchPower: ols.homeMatchPower,
        awayMatchPower: ols.awayMatchPower,
      });
    } else {
      const legacy = calculateWinProbabilities({
        homeElo,
        awayElo,
        homeAdvantageElo,
        homeRecentFormScore: recentFormToScore(homeSnap?.recentForm),
        awayRecentFormScore: recentFormToScore(awaySnap?.recentForm),
        homeAttackRating: homeSnap?.attackRating ?? 50,
        awayAttackRating: awaySnap?.attackRating ?? 50,
        homeDefenseRating: homeSnap?.defenseRating ?? 50,
        awayDefenseRating: awaySnap?.defenseRating ?? 50,
        homeInjuryImpact: homeSnap?.injuryImpact ?? 0,
        awayInjuryImpact: awaySnap?.injuryImpact ?? 0,
        homeFatigueIndex: homeSnap?.fatigueIndex ?? 0,
        awayFatigueIndex: awaySnap?.fatigueIndex ?? 0,
        weatherImpactScore: match.weatherSnapshot?.weatherImpactScore ?? 0,
      });
      win = {
        homeWinProbability: legacy.homeWinProbability,
        drawProbability: legacy.drawProbability,
        awayWinProbability: legacy.awayWinProbability,
        factorBreakdown: {
          ...legacy.factorBreakdown,
          winProbSource: 'ELO_FORM_FALLBACK',
        },
      };
    }

    const leagueAvg = this.config.get<number>('leagueAvgGoals') ?? 2.7;
    const xg = calculateExpectedGoals({
      homeGoalsForAvg: homeSnap?.goalsForAvg ?? leagueAvg / 2,
      homeGoalsAgainstAvg: homeSnap?.goalsAgainstAvg ?? leagueAvg / 2,
      awayGoalsForAvg: awaySnap?.goalsForAvg ?? leagueAvg / 2,
      awayGoalsAgainstAvg: awaySnap?.goalsAgainstAvg ?? leagueAvg / 2,
      homeXgAvg: homeSnap?.xgAvg,
      homeXgaAvg: homeSnap?.xgaAvg,
      awayXgAvg: awaySnap?.xgAvg,
      awayXgaAvg: awaySnap?.xgaAvg,
      leagueAvgGoals: leagueAvg,
      homeAdvantage: this.config.get<number>('homeAdvantageXg') ?? 1.08,
      awayAdjustment: this.config.get<number>('awayAdvantageXg') ?? 0.94,
    });

    const tempo = calculateTempoIndex({
      totalExpectedGoals: xg.totalExpectedGoals,
      homeAttackRating: homeSnap?.attackRating ?? 50,
      awayAttackRating: awaySnap?.attackRating ?? 50,
      foulsAvg: match.refereeSnapshot?.foulsAvg,
      condition: match.weatherSnapshot?.condition,
      windSpeed: match.weatherSnapshot?.windSpeed,
      pitchCondition: match.weatherSnapshot?.pitchCondition,
    });

    const favoriteIsHome = win.homeWinProbability >= win.awayWinProbability;
    const upset = calculateUpsetIndex({
      eloDiff: homeElo - awayElo,
      rankDiff: Math.abs((homeSnap?.leagueRank ?? 10) - (awaySnap?.leagueRank ?? 10)),
      favoriteInjuryImpact: favoriteIsHome
        ? homeSnap?.injuryImpact ?? 0
        : awaySnap?.injuryImpact ?? 0,
      favoriteFatigue: favoriteIsHome
        ? homeSnap?.fatigueIndex ?? 0
        : awaySnap?.fatigueIndex ?? 0,
      underdogRecentForm: favoriteIsHome
        ? recentFormToScore(awaySnap?.recentForm)
        : recentFormToScore(homeSnap?.recentForm),
      weatherRough: (match.weatherSnapshot?.windSpeed ?? 0) > 10,
    });

    const confidence = this.estimateConfidence(homeSnap, awaySnap);
    const oddsSnapshot = pickBestOddsSnapshot(match.oddsSnapshots);
    const predictionMarkets = buildPredictionMarkets({
      homeWinProbability: win.homeWinProbability,
      drawProbability: win.drawProbability,
      awayWinProbability: win.awayWinProbability,
      totalExpectedGoals: xg.totalExpectedGoals,
      homeMatchPower: ols?.homeMatchPower ?? null,
      awayMatchPower: ols?.awayMatchPower ?? null,
      oddsSnapshot,
    });

    const inputsHash = computeInputsHash({
      modelVersion: MODEL_VERSION,
      teamSnapshotUpdatedAt: {
        home: homeSnap?.updatedAt?.toISOString() ?? null,
        away: awaySnap?.updatedAt?.toISOString() ?? null,
      },
      oddsSnapshotId: oddsSnapshot?.id ?? null,
      afPreMatchCursors: {
        snapshot24At: match.afPreMatchSnapshot24At?.toISOString() ?? null,
        snapshot1At: match.afPreMatchSnapshot1At?.toISOString() ?? null,
        odds24At: match.afOddsSnapshot24At?.toISOString() ?? null,
        odds1At: match.afOddsSnapshot1At?.toISOString() ?? null,
      },
    });

    const latest = match.predictions[0] ?? match.activePrediction;
    const createNew = shouldCreateNewVersion(match, latest);
    const now = new Date();
    const lockAt =
      latest && !createNew && shouldLockNow(match, latest, now) ? now : undefined;

    const payload = {
      homeWinProbability: win.homeWinProbability,
      drawProbability: win.drawProbability,
      awayWinProbability: win.awayWinProbability,
      homeExpectedGoals: xg.homeExpectedGoals,
      awayExpectedGoals: xg.awayExpectedGoals,
      totalExpectedGoals: xg.totalExpectedGoals,
      totalGoalsTrend: xg.totalGoalsTrend,
      tempoIndex: tempo,
      upsetIndex: upset.upsetIndex,
      homeMatchPower: ols?.homeMatchPower ?? null,
      awayMatchPower: ols?.awayMatchPower ?? null,
      confidence,
      modelVersion: MODEL_VERSION,
      inputsHash,
      oddsSnapshotId: oddsSnapshot?.id ?? null,
      predictionMarkets: predictionMarkets as Prisma.InputJsonValue,
      factorBreakdown: {
        ...win.factorBreakdown,
        upset: upset.explanation,
        ols: ols?.olsFactor ?? null,
        warnings: warnings.length ? warnings : undefined,
      } as Prisma.InputJsonValue,
      explanation: `${xg.explanation} ${upset.explanation}`,
      dataQuality: DataQuality.MODEL_ESTIMATED,
      dataSource: DataSourceType.MODEL,
    };

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

    return prediction;
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

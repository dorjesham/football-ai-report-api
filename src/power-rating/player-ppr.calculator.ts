import type { Prisma } from '@prisma/client';
import { clamp } from '../common/utils/clamp';
import { round1, weightedSum } from './ols-math';

/** 与《战力算法.md》文档二 §10.2 对齐的位置分组 */
export type PositionGroup =
  | 'FW'
  | 'WINGER'
  | 'AM'
  | 'CM'
  | 'DM'
  | 'CB'
  | 'FB'
  | 'WB'
  | 'GK'
  | 'DEFAULT';

export function mapFdPositionToGroup(position: string | null | undefined): PositionGroup {
  const p = (position || '').toUpperCase();
  if (!p) return 'DEFAULT';
  if (p.includes('GOAL')) return 'GK';
  if (p.includes('KEEP')) return 'GK';
  if (p.includes('OFFENCE') || p.includes('ATTACK') || p === 'FW' || p.includes('FORWARD'))
    return 'FW';
  if (p.includes('WING')) return 'WINGER';
  if (p.includes('MIDFIELD')) return 'CM';
  if (p.includes('DEFENCE') || p.includes('DEFENSE') || p === 'DEF') return 'CB';
  if (p.includes('BACK')) return 'FB';
  return 'DEFAULT';
}

export function extractMarketValueEuroFromProfile(profile: Prisma.JsonValue | null | undefined): number | null {
  if (profile == null || typeof profile !== 'object' || Array.isArray(profile)) return null;
  const root = profile as Record<string, unknown>;
  const fdSquad = root.fdSquad as Record<string, unknown> | undefined;
  const raw = fdSquad?.raw as Record<string, unknown> | undefined;
  const mv = raw?.marketValue;
  if (typeof mv === 'number' && Number.isFinite(mv) && mv > 0) return mv;
  return null;
}

/** 身价（欧）→ 基础能力子分的一部分 */
export function marketValueToLongTermScore(mv: number | null): number {
  if (mv == null || mv <= 0) return 50;
  const m = mv / 1_000_000;
  if (m < 0.5) return clamp(44 + m * 14, 42, 52);
  if (m < 5) return clamp(50 + m * 4.5, 48, 68);
  if (m < 30) return clamp(65 + (m - 5) * 0.55, 63, 82);
  return clamp(78 + Math.log10(m + 1) * 5, 76, 94);
}

export function marketValueToBaseAbilityScore(mv: number | null): number {
  const longTerm = marketValueToLongTermScore(mv);
  const marketValueScore = marketValueToLongTermScore(mv);
  const leagueLevelScore = 58;
  const historicalOutputScore = clamp(longTerm * 0.96, 40, 90);
  const ageCurveScore = 62;
  const internationalExperienceScore = 55;
  return round1(
    weightedSum([
      { score: longTerm, weight: 0.35 },
      { score: marketValueScore, weight: 0.2 },
      { score: leagueLevelScore, weight: 0.15 },
      { score: historicalOutputScore, weight: 0.15 },
      { score: ageCurveScore, weight: 0.1 },
      { score: internationalExperienceScore, weight: 0.05 },
    ]),
  );
}

type PprSubScores = {
  baseAbilityScore: number;
  recentFormScore: number;
  roleImportanceScore: number;
  availabilityScore: number;
  consistencyScore: number;
  matchFitnessScore: number;
  bigMatchScore: number;
  tacticalFitScore: number;
  positionGroup: PositionGroup;
  xGScore: number;
  goalsScore: number;
  shotQualityScore: number;
  defensiveActionScore: number;
  duelScore: number;
  xAScore: number;
  progressivePassScore: number;
  postShotXGScore: number;
  savePercentageScore: number;
  errorControlScore: number;
};

function normalizeStartProbPercent(x: number | null | undefined): number | null {
  if (x == null || !Number.isFinite(x)) return null;
  if (x >= 0 && x <= 1) return clamp(x * 100, 5, 99);
  return clamp(x, 5, 99);
}

function defaultSubScores(form: number | null, fitness: number | null, startProb: number | null): Partial<PprSubScores> {
  const f = clamp(form ?? 58, 25, 95);
  const fit = clamp(fitness ?? 62, 25, 95);
  const spNorm = normalizeStartProbPercent(startProb);
  const sp = spNorm != null ? spNorm : 58;
  return {
    recentFormScore: f,
    matchFitnessScore: fit,
    roleImportanceScore: sp,
    availabilityScore: clamp(88 - (100 - fit) * 0.35, 35, 96),
    consistencyScore: clamp(f * 0.92 + 4, 30, 92),
    bigMatchScore: clamp(sp * 0.85, 35, 88),
    tacticalFitScore: 58,
    xGScore: clamp(f * 0.9, 30, 92),
    goalsScore: clamp(f * 0.88, 30, 90),
    shotQualityScore: clamp(f * 0.86, 30, 88),
    defensiveActionScore: clamp(fit * 0.9, 30, 90),
    duelScore: clamp((fit + f) / 2, 30, 90),
    xAScore: clamp(f * 0.87, 30, 90),
    progressivePassScore: clamp(f * 0.85, 30, 88),
    postShotXGScore: clamp(fit * 0.92, 30, 92),
    savePercentageScore: clamp(fit * 0.94, 30, 94),
    errorControlScore: clamp(92 - (100 - fit) * 0.4, 40, 94),
  };
}

/** 文档二 §10.2 */
export function calculatePositionPerformanceV2(data: PprSubScores): number {
  switch (data.positionGroup) {
    case 'FW':
      return weightedSum([
        { score: data.xGScore, weight: 0.24 },
        { score: data.goalsScore, weight: 0.18 },
        { score: data.shotQualityScore, weight: 0.14 },
        { score: data.xGScore * 0.95, weight: 0.1 },
        { score: data.recentFormScore, weight: 0.1 },
        { score: data.xAScore, weight: 0.08 },
        { score: data.defensiveActionScore, weight: 0.08 },
        { score: data.duelScore, weight: 0.05 },
        { score: data.consistencyScore, weight: 0.03 },
      ]);
    case 'WINGER':
    case 'AM':
      return weightedSum([
        { score: data.xGScore, weight: 0.13 },
        { score: data.xAScore, weight: 0.18 },
        { score: data.shotQualityScore, weight: 0.14 },
        { score: data.progressivePassScore, weight: 0.14 },
        { score: data.goalsScore, weight: 0.12 },
        { score: data.recentFormScore, weight: 0.12 },
        { score: data.xAScore * 0.9, weight: 0.09 },
        { score: data.duelScore, weight: 0.05 },
        { score: data.consistencyScore, weight: 0.03 },
      ]);
    case 'CM':
    case 'DM':
      return weightedSum([
        { score: data.progressivePassScore, weight: 0.17 },
        { score: data.xAScore, weight: 0.14 },
        { score: data.duelScore, weight: 0.13 },
        { score: data.defensiveActionScore, weight: 0.12 },
        { score: data.defensiveActionScore * 0.95, weight: 0.12 },
        { score: data.xAScore, weight: 0.09 },
        { score: data.duelScore, weight: 0.09 },
        { score: data.recentFormScore, weight: 0.09 },
        { score: data.consistencyScore, weight: 0.05 },
      ]);
    case 'CB':
      return weightedSum([
        { score: data.defensiveActionScore, weight: 0.18 },
        { score: data.duelScore, weight: 0.17 },
        { score: data.duelScore * 0.95, weight: 0.14 },
        { score: data.errorControlScore, weight: 0.13 },
        { score: data.progressivePassScore, weight: 0.12 },
        { score: data.errorControlScore * 0.95, weight: 0.11 },
        { score: data.defensiveActionScore * 0.85, weight: 0.09 },
        { score: data.consistencyScore, weight: 0.06 },
      ]);
    case 'FB':
    case 'WB':
      return weightedSum([
        { score: data.defensiveActionScore, weight: 0.15 },
        { score: data.xAScore, weight: 0.13 },
        { score: data.progressivePassScore, weight: 0.13 },
        { score: data.xAScore, weight: 0.11 },
        { score: data.duelScore, weight: 0.13 },
        { score: data.recentFormScore, weight: 0.1 },
        { score: data.matchFitnessScore, weight: 0.09 },
        { score: data.duelScore * 0.9, weight: 0.09 },
        { score: data.consistencyScore, weight: 0.07 },
      ]);
    case 'GK':
      return weightedSum([
        { score: data.postShotXGScore, weight: 0.24 },
        { score: data.savePercentageScore, weight: 0.18 },
        { score: data.errorControlScore, weight: 0.14 },
        { score: data.matchFitnessScore, weight: 0.1 },
        { score: data.defensiveActionScore, weight: 0.1 },
        { score: data.progressivePassScore, weight: 0.11 },
        { score: data.savePercentageScore * 0.85, weight: 0.05 },
        { score: data.consistencyScore, weight: 0.08 },
      ]);
    default:
      return clamp(data.recentFormScore, 35, 88);
  }
}

/** 文档二 §10.1 PPR */
export function calculatePlayerPowerV2(data: PprSubScores): number {
  const positionPerformanceScore = calculatePositionPerformanceV2(data);
  const raw = weightedSum([
    { score: data.baseAbilityScore, weight: 0.18 },
    { score: data.recentFormScore, weight: 0.18 },
    { score: positionPerformanceScore, weight: 0.22 },
    { score: data.roleImportanceScore, weight: 0.14 },
    { score: data.availabilityScore, weight: 0.1 },
    { score: data.consistencyScore, weight: 0.07 },
    { score: data.matchFitnessScore, weight: 0.06 },
    { score: data.bigMatchScore, weight: 0.03 },
    { score: data.tacticalFitScore, weight: 0.02 },
  ]);
  return round1(clamp(raw, 28, 99));
}

export type PlayerPprContext = {
  position: string | null;
  profile: Prisma.JsonValue | null;
  formScore: number | null;
  fitnessScore: number | null;
  expectedStartProbability: number | null;
};

export function computePlayerPprFromContext(ctx: PlayerPprContext): {
  ppr: number;
  meta: Record<string, unknown>;
} {
  const mv = extractMarketValueEuroFromProfile(ctx.profile);
  const baseAbilityScore = marketValueToBaseAbilityScore(mv);
  const positionGroup = mapFdPositionToGroup(ctx.position);
  const subs = defaultSubScores(ctx.formScore, ctx.fitnessScore, ctx.expectedStartProbability);
  const data: PprSubScores = {
    baseAbilityScore,
    positionGroup,
    recentFormScore: subs.recentFormScore!,
    roleImportanceScore: subs.roleImportanceScore!,
    availabilityScore: subs.availabilityScore!,
    consistencyScore: subs.consistencyScore!,
    matchFitnessScore: subs.matchFitnessScore!,
    bigMatchScore: subs.bigMatchScore!,
    tacticalFitScore: subs.tacticalFitScore!,
    xGScore: subs.xGScore!,
    goalsScore: subs.goalsScore!,
    shotQualityScore: subs.shotQualityScore!,
    defensiveActionScore: subs.defensiveActionScore!,
    duelScore: subs.duelScore!,
    xAScore: subs.xAScore!,
    progressivePassScore: subs.progressivePassScore!,
    postShotXGScore: subs.postShotXGScore!,
    savePercentageScore: subs.savePercentageScore!,
    errorControlScore: subs.errorControlScore!,
  };
  const ppr = calculatePlayerPowerV2(data);
  return {
    ppr,
    meta: {
      modelVersion: 'OLS_PPR_V2',
      positionGroup,
      marketValueEuro: mv,
      baseAbilityScore,
      positionPerformanceScore: calculatePositionPerformanceV2(data),
    },
  };
}

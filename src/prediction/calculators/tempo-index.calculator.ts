import { clamp } from '../../common/utils/clamp';

export type TempoInput = {
  totalExpectedGoals: number;
  homeAttackRating: number;
  awayAttackRating: number;
  foulsAvg?: number | null;
  condition?: string | null;
  windSpeed?: number | null;
  pitchCondition?: string | null;
};

function refereeTempoScore(foulsAvg?: number | null): number {
  if (foulsAvg == null) return 50;
  if (foulsAvg > 24) return 35;
  if (foulsAvg > 20) return 45;
  return 55;
}

function weatherTempoScore(input: TempoInput): number {
  const c = (input.condition || '').toLowerCase();
  const p = (input.pitchCondition || '').toLowerCase();
  if (c.includes('暴雨') || c.includes('大雪') || p.includes('糟糕')) return 30;
  if ((input.windSpeed ?? 0) > 12) return 40;
  if (c.includes('雨')) return 48;
  return 55;
}

export function calculateTempoIndex(input: TempoInput): number {
  const tempoBase = (input.totalExpectedGoals / 4.0) * 100;
  const avgAttack = (input.homeAttackRating + input.awayAttackRating) / 2;
  const referee = refereeTempoScore(input.foulsAvg);
  const weather = weatherTempoScore(input);
  return Math.round(
    clamp(
      tempoBase * 0.55 + avgAttack * 0.25 + referee * 0.1 + weather * 0.1,
      0,
      100,
    ),
  );
}

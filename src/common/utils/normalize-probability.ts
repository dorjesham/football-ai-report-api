import { clamp } from './clamp';

/** 三项整数概率归一化到总和 100，每项限制在 [minPct, maxPct] */
export function normalizeThreeWayProbs(
  home: number,
  draw: number,
  away: number,
  minPct = 1,
  maxPct = 98,
): { home: number; draw: number; away: number } {
  let h = clamp(Math.round(home), minPct, maxPct);
  let d = clamp(Math.round(draw), minPct, maxPct);
  let a = clamp(Math.round(away), minPct, maxPct);
  const sum = h + d + a;
  if (sum === 100) return { home: h, draw: d, away: a };
  const scale = 100 / sum;
  h = Math.round(h * scale);
  d = Math.round(d * scale);
  a = 100 - h - d;
  h = clamp(h, minPct, maxPct);
  d = clamp(d, minPct, maxPct);
  a = clamp(a, minPct, maxPct);
  let diff = 100 - (h + d + a);
  if (diff !== 0) {
    const largest = h >= d && h >= a ? 'h' : d >= a ? 'd' : 'a';
    if (largest === 'h') h += diff;
    else if (largest === 'd') d += diff;
    else a += diff;
  }
  return { home: h, draw: d, away: a };
}

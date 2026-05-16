import type { MatchPublicBrief } from '../types/match-public-brief';

const NOISE = /\b(fc|sc|cf|afc|the|club|deportivo)\b/gi;

export function normalizeTeamLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(NOISE, ' ')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Loose match for cross-source team labels (EN/CN/abbrev). */
export function roughTeamMatch(a: string, b: string): boolean {
  const x = normalizeTeamLabel(a);
  const y = normalizeTeamLabel(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x))) return true;
  const xt = new Set(x.split(' ').filter((w) => w.length > 2));
  const yt = new Set(y.split(' ').filter((w) => w.length > 2));
  let overlap = 0;
  for (const w of xt) if (yt.has(w)) overlap++;
  return overlap >= 1 && (overlap >= 2 || x.length <= 12 || y.length <= 12);
}

export function matchHomeAwayToPair(
  homeLabel: string,
  awayLabel: string,
  brief: MatchPublicBrief,
): boolean {
  const { homeTeam, awayTeam } = brief;
  const h = [homeTeam.nameEn, homeTeam.nameCn, homeTeam.shortName || ''].filter(Boolean);
  const a = [awayTeam.nameEn, awayTeam.nameCn, awayTeam.shortName || ''].filter(Boolean);
  const forward =
    h.some((x) => roughTeamMatch(homeLabel, x)) && a.some((x) => roughTeamMatch(awayLabel, x));
  const swapped =
    h.some((x) => roughTeamMatch(awayLabel, x)) && a.some((x) => roughTeamMatch(homeLabel, x));
  return forward || swapped;
}

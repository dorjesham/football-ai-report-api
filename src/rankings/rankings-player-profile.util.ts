import type { Prisma } from '@prisma/client';

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 从 profile.apiFootball / fbref 提取展示用赛季统计 */
export function extractPlayerSeasonStats(profile: Prisma.JsonValue | null | undefined) {
  const root = asRecord(profile);
  if (!root) return { goals: null, assists: null, minutes: null, age: null };

  let goals: number | null = null;
  let assists: number | null = null;
  let minutes: number | null = null;
  let age: number | null = null;

  const af = asRecord(root.apiFootball);
  const seasons = asRecord(af?.seasons);
  if (seasons) {
    const keys = Object.keys(seasons).sort((a, b) => Number(b) - Number(a));
    const latest = keys.length ? asRecord(seasons[keys[0]]) : null;
    const snap = asRecord(latest?.snapshot);
    const statsArr = Array.isArray(snap?.statistics) ? snap.statistics : [];
    const st0 = statsArr.length ? asRecord(statsArr[0]) : null;
    const g = asRecord(st0?.goals);
    goals = num(g?.total) ?? goals;
    const games = asRecord(st0?.games);
    minutes = num(games?.minutes) ?? minutes;
  }

  const fbref = asRecord(root.fbref);
  const fbSeasons = asRecord(fbref?.seasons);
  if (fbSeasons) {
    const keys = Object.keys(fbSeasons).sort();
    const latest = keys.length ? asRecord(fbSeasons[keys[keys.length - 1]]) : null;
    const raw = asRecord(latest?.raw);
    goals = num(raw?.Gls) ?? num(raw?.Goals) ?? goals;
    assists = num(raw?.Ast) ?? num(raw?.Assists) ?? assists;
    minutes = num(raw?.Min) ?? num(raw?.Minutes) ?? minutes;
  }

  const fd = asRecord(root.fdSquad);
  const fdRaw = asRecord(fd?.raw);
  age = num(fdRaw?.age) ?? age;

  return { goals, assists, minutes, age };
}

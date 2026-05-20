import type { Prisma } from '@prisma/client';
import { extractPlayerSeasonStats } from '../rankings/rankings-player-profile.util';

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function buildPlayerSeasonStatsBlock(profile: Prisma.JsonValue | null | undefined) {
  const base = extractPlayerSeasonStats(profile);
  const root = asRecord(profile);
  const radarHints: Record<string, number | null> = {};

  const meta = asRecord(root?.powerRatingMeta);
  if (meta) {
    for (const [k, v] of Object.entries(meta)) {
      if (typeof v === 'number' && Number.isFinite(v)) radarHints[k] = v;
    }
  }

  return {
    goals: base.goals,
    assists: base.assists,
    minutes: base.minutes,
    age: base.age,
    appearances: null as number | null,
    rating: null as number | null,
    radarHints,
  };
}

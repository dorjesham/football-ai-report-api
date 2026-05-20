import { asRecord } from './af-fixture-match-fields.util';
import type { RecentFormMatchRow } from '../match-phase/match-detail-pre-unlocked.types';

export const PRE_MATCH_UI_FACTS_KEY = 'PRE_MATCH_UI_V1' as const;

export type PreMatchUiFactsV1 = {
  recentForm?: {
    home?: { form?: string | null; matches?: RecentFormMatchRow[] };
    away?: { form?: string | null; matches?: RecentFormMatchRow[] };
  };
};

export function parsePreMatchUiFacts(supplementaryFacts: unknown): PreMatchUiFactsV1 | null {
  if (!supplementaryFacts || typeof supplementaryFacts !== 'object') return null;
  const root = supplementaryFacts as Record<string, unknown>;
  const block = root[PRE_MATCH_UI_FACTS_KEY];
  if (!block || typeof block !== 'object') return null;
  return block as PreMatchUiFactsV1;
}

function resultFromGoals(teamGoals: number, oppGoals: number): 'W' | 'D' | 'L' {
  if (teamGoals > oppGoals) return 'W';
  if (teamGoals < oppGoals) return 'L';
  return 'D';
}

/**
 * AF GET /fixtures?team=&last= → 近 N 场列表（用于详情页近期战绩）
 */
export function mapTeamRecentFixtures(
  response: unknown[],
  apiTeamId: number,
  teamNameCn: string,
  max = 5,
): RecentFormMatchRow[] {
  const rows: RecentFormMatchRow[] = [];
  for (const wrap of response) {
    if (rows.length >= max) break;
    const rec = asRecord(wrap);
    const fixture = asRecord(rec?.fixture);
    const teams = asRecord(rec?.teams);
    const goals = asRecord(rec?.goals);
    const home = asRecord(teams?.home);
    const away = asRecord(teams?.away);
    const homeId = Number(home?.id);
    const awayId = Number(away?.id);
    const homeGoals = Number(goals?.home);
    const awayGoals = Number(goals?.away);
    if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) continue;

    const isHome = homeId === apiTeamId;
    const isAway = awayId === apiTeamId;
    if (!isHome && !isAway) continue;

    const teamGoals = isHome ? homeGoals : awayGoals;
    const oppGoals = isHome ? awayGoals : homeGoals;
    const opponent = isHome ? away : home;
    const opponentName =
      typeof opponent?.name === 'string' ? opponent.name : teamNameCn;

    rows.push({
      result: resultFromGoals(teamGoals, oppGoals),
      scoreLabel: `${teamGoals}-${oppGoals}`,
      opponentName,
      venue: isHome ? 'home' : 'away',
    });
  }
  return rows;
}

export function mergePreMatchUiFacts(
  existing: unknown,
  patch: PreMatchUiFactsV1,
): Record<string, unknown> {
  const root =
    existing && typeof existing === 'object' ?
      { ...(existing as Record<string, unknown>) }
    : {};
  const prev = parsePreMatchUiFacts(root) ?? {};
  root[PRE_MATCH_UI_FACTS_KEY] = {
    ...prev,
    ...patch,
    recentForm: {
      ...prev.recentForm,
      ...patch.recentForm,
      home: { ...prev.recentForm?.home, ...patch.recentForm?.home },
      away: { ...prev.recentForm?.away, ...patch.recentForm?.away },
    },
  };
  return root;
}

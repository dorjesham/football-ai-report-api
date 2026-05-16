import { MatchStatus } from '@prisma/client';

export type AfFactsSyncCheckMatch = {
  status: MatchStatus;
  kickoffTime?: Date;
};

export type AfFactsSyncCheckFacts = {
  lineups: unknown;
  events: unknown;
  teamStats: unknown;
  afLastSyncedAt: Date | null;
  afLiveLastSyncedAt?: Date | null;
} | null;

export type NeedsAfFactsSyncResult = {
  needed: boolean;
  reason: string;
};

function jsonArrayNonEmpty(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

/** 判断 FINISHED 场次是否仍需拉取 AF 四接口事实包（幂等/增量）。 */
export function needsAfFactsSync(
  match: AfFactsSyncCheckMatch,
  facts: AfFactsSyncCheckFacts,
  opts?: { force?: boolean },
): NeedsAfFactsSyncResult {
  if (opts?.force === true) {
    return { needed: true, reason: 'force=true' };
  }
  if (match.status !== MatchStatus.FINISHED) {
    return {
      needed: false,
      reason: `match.status=${match.status} (full facts sync only for FINISHED)`,
    };
  }
  if (!facts) {
    return { needed: true, reason: 'no MatchFacts row' };
  }
  if (facts.afLastSyncedAt == null) {
    return { needed: true, reason: 'afLastSyncedAt missing' };
  }
  const hasLineups = jsonArrayNonEmpty(facts.lineups);
  const hasEvents = jsonArrayNonEmpty(facts.events);
  const hasStats = jsonArrayNonEmpty(facts.teamStats);
  if (hasLineups && hasEvents && hasStats) {
    return { needed: false, reason: 'facts complete (lineups/events/teamStats)' };
  }
  const missing: string[] = [];
  if (!hasLineups) missing.push('lineups');
  if (!hasEvents) missing.push('events');
  if (!hasStats) missing.push('teamStats');
  return { needed: true, reason: `incomplete: ${missing.join(', ')}` };
}

/** 是否处于赛中 live facts 同步窗口 */
export function isMatchInLiveFactsWindow(
  match: Pick<AfFactsSyncCheckMatch, 'status' | 'kickoffTime'>,
  now = new Date(),
): boolean {
  if (match.status === MatchStatus.LIVE) return true;
  if (match.status === MatchStatus.SCHEDULED && match.kickoffTime) {
    const kick = match.kickoffTime.getTime();
    if (kick <= now.getTime() && now.getTime() - kick < 15 * 60_000) {
      return true;
    }
  }
  return false;
}

/** LIVE 场次：按间隔拉取 AF events/statistics */
export function needsAfLiveFactsSync(
  match: AfFactsSyncCheckMatch,
  facts: AfFactsSyncCheckFacts,
  opts?: { force?: boolean; minIntervalSec?: number },
): NeedsAfFactsSyncResult {
  if (opts?.force === true) {
    return { needed: true, reason: 'force=true' };
  }
  if (!isMatchInLiveFactsWindow(match)) {
    return {
      needed: false,
      reason: `not in live window (status=${match.status})`,
    };
  }
  const intervalMs = Math.max(15, opts?.minIntervalSec ?? 30) * 1000;
  const last = facts?.afLiveLastSyncedAt;
  if (!last) {
    return { needed: true, reason: 'afLiveLastSyncedAt missing' };
  }
  if (Date.now() - last.getTime() >= intervalMs) {
    return { needed: true, reason: 'interval elapsed' };
  }
  return { needed: false, reason: 'within min interval' };
}

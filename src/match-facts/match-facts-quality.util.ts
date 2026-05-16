import { MatchStatus } from '@prisma/client';
import { parseMatchEventsStorage } from '../match-live/match-events-storage.util';

export type FactsQualityIssueCode =
  | 'MISSING_FACTS_ROW'
  | 'NEVER_VALIDATED'
  | 'STALE_AF_SYNC'
  | 'MISSING_EVENTS'
  | 'MISSING_TEAM_STATS'
  | 'MISSING_LINEUPS'
  | 'LIVE_STUCK'
  | 'SCORE_MISMATCH';

export type FactsQualityIssue = {
  code: FactsQualityIssueCode;
  message: string;
  severity: 'warn' | 'error';
};

export type MatchFactsQualityInput = {
  matchId: string;
  status: MatchStatus;
  kickoffTime: Date;
  homeScore: number | null;
  awayScore: number | null;
  facts: {
    afLastSyncedAt?: Date | null;
    afLiveLastSyncedAt?: Date | null;
    validatedAt?: Date | null;
    events?: unknown;
    teamStats?: unknown;
    lineups?: unknown;
    ftHome?: number | null;
    ftAway?: number | null;
  } | null;
};

export function assessMatchFactsQuality(
  row: MatchFactsQualityInput,
  opts?: { staleAfHours?: number; liveStuckMinutes?: number },
): FactsQualityIssue[] {
  const issues: FactsQualityIssue[] = [];
  const staleH = opts?.staleAfHours ?? 48;
  const liveStuck = opts?.liveStuckMinutes ?? 100;

  if (!row.facts) {
    if (row.status === MatchStatus.FINISHED) {
      issues.push({
        code: 'MISSING_FACTS_ROW',
        message: 'FINISHED 但无 MatchFacts 行',
        severity: 'error',
      });
    }
    return issues;
  }

  const f = row.facts;
  if (!f.validatedAt) {
    issues.push({
      code: 'NEVER_VALIDATED',
      message: 'validatedAt 为空',
      severity: 'warn',
    });
  }

  if (row.status === MatchStatus.FINISHED) {
    const events = parseMatchEventsStorage(f.events).items;
    if (events.length === 0) {
      issues.push({
        code: 'MISSING_EVENTS',
        message: '完场无事件数据',
        severity: 'warn',
      });
    }
    if (!f.teamStats) {
      issues.push({
        code: 'MISSING_TEAM_STATS',
        message: '完场无 teamStats',
        severity: 'warn',
      });
    }
    if (!f.lineups) {
      issues.push({
        code: 'MISSING_LINEUPS',
        message: '完场无 lineups',
        severity: 'warn',
      });
    }
    if (
      f.ftHome != null &&
      f.ftAway != null &&
      row.homeScore != null &&
      row.awayScore != null &&
      (f.ftHome !== row.homeScore || f.ftAway !== row.awayScore)
    ) {
      issues.push({
        code: 'SCORE_MISMATCH',
        message: `MatchFacts 比分 ${f.ftHome}-${f.ftAway} 与 Match ${row.homeScore}-${row.awayScore} 不一致`,
        severity: 'error',
      });
    }
    const lastAf = f.afLastSyncedAt ?? f.afLiveLastSyncedAt;
    if (lastAf) {
      const ageH = (Date.now() - lastAf.getTime()) / 3600_000;
      if (ageH > staleH) {
        issues.push({
          code: 'STALE_AF_SYNC',
          message: `AF 同步已超过 ${staleH}h`,
          severity: 'warn',
        });
      }
    }
  }

  if (row.status === MatchStatus.LIVE) {
    const elapsed =
      (Date.now() - row.kickoffTime.getTime()) / 60_000;
    if (elapsed >= liveStuck) {
      issues.push({
        code: 'LIVE_STUCK',
        message: `开球后 ${Math.floor(elapsed)} 分钟仍为 LIVE`,
        severity: 'warn',
      });
    }
  }

  return issues;
}

export function buildValidationLogEntry(
  issues: FactsQualityIssue[],
  extra?: Record<string, unknown>,
) {
  return {
    kind: 'MATCH_FACTS_QUALITY_V1',
    at: new Date().toISOString(),
    pass: issues.every((i) => i.severity !== 'error'),
    issues,
    ...extra,
  };
}

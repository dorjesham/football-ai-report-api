import { createHash } from 'crypto';
import { Match, MatchPrediction, MatchStatus } from '@prisma/client';

const LOCK_MINUTES_BEFORE_KICKOFF = 5;

export type InputsHashPayload = {
  modelVersion: string;
  teamSnapshotUpdatedAt?: { home: string | null; away: string | null };
  oddsSnapshotId?: string | null;
  afPreMatchCursors?: {
    snapshot24At: string | null;
    snapshot1At: string | null;
    odds24At: string | null;
    odds1At: string | null;
  };
  afFixtureId?: number;
  afRawHash?: string;
};

function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const rec = obj as Record<string, unknown>;
  const keys = Object.keys(rec).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(rec[k])}`).join(',')}}`;
}

export function computeInputsHash(payload: InputsHashPayload): string {
  const raw = stableStringify(payload);
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

export function resolveLockTime(match: Pick<Match, 'kickoffTime'>): Date {
  return new Date(match.kickoffTime.getTime() - LOCK_MINUTES_BEFORE_KICKOFF * 60_000);
}

export function shouldCreateNewVersion(
  match: Pick<Match, 'status'>,
  latestPrediction: Pick<MatchPrediction, 'lockedAt' | 'version'> | null,
): boolean {
  if (!latestPrediction) return false;
  if (latestPrediction.lockedAt != null) return true;
  if (match.status === MatchStatus.LIVE || match.status === MatchStatus.FINISHED) {
    return true;
  }
  return false;
}

export function shouldLockNow(
  match: Pick<Match, 'kickoffTime'>,
  prediction: Pick<MatchPrediction, 'lockedAt'>,
  now = new Date(),
): boolean {
  if (prediction.lockedAt != null) return false;
  return now.getTime() >= resolveLockTime(match).getTime();
}

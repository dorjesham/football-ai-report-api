import { isKickoffHorizonInWindow } from '../../public-sources/public-source-schedule.util';

export type PreMatchSnapshotPhase = 'T24' | 'T1';

/** 按距开球窗口选择赛前快照/赔率主阶段（与 AF Cron 对齐）。 */
export function resolvePreMatchPhase(
  now: Date,
  kickoff: Date,
): PreMatchSnapshotPhase {
  if (isKickoffHorizonInWindow(now, kickoff, 1)) return 'T1';
  return 'T24';
}

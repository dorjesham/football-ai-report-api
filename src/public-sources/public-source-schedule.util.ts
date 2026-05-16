/** 与 Cron 周期（建议每 10 分钟）对齐：目标时刻 ± 窗口内视为命中该阶段。 */
export const PUBLIC_SOURCE_PHASE_HALF_WINDOW_MS = 18 * 60 * 1000;

export type PublicSourceScheduledPhase = 'T48' | 'T8' | 'T2' | 'POST';

/** 开球前 `hoursBefore` 小时的目标时刻是否落在当前时间的窗口内（未来场次）。 */
export function isKickoffHorizonInWindow(
  now: Date,
  kickoff: Date,
  hoursBefore: number,
): boolean {
  if (kickoff.getTime() <= now.getTime()) return false;
  const target = kickoff.getTime() - hoursBefore * 3600000;
  return Math.abs(now.getTime() - target) <= PUBLIC_SOURCE_PHASE_HALF_WINDOW_MS;
}

/**
 * 完场后补抓：1) 行在约 45 分钟内更新（常与赛果同步）；或 2) 开球后约 95～150 分钟且已 FINISHED
 *（覆盖「终场后约一刻钟」量级，即使 `updatedAt` 未立刻变化）。
 */
export function isPostFinishFetchWindow(
  now: Date,
  kickoff: Date,
  status: string,
  updatedAt: Date,
): boolean {
  if (status !== 'FINISHED') return false;
  if (kickoff.getTime() >= now.getTime()) return false;
  const sinceUpdate = now.getTime() - updatedAt.getTime();
  if (sinceUpdate >= 0 && sinceUpdate <= 45 * 60 * 1000) return true;
  const msSinceKickoff = now.getTime() - kickoff.getTime();
  return msSinceKickoff >= 95 * 60 * 1000 && msSinceKickoff <= 150 * 60 * 1000;
}

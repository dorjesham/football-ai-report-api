import { MatchStatus } from '@prisma/client';

/** 常规时间 + 中场 + 少量补时后仍标 LIVE：高度怀疑同步滞后，应优先轮询 / 前端加强刷新 */
export const LIVE_LONG_FOR_SYNC_PRIORITY_MINUTES = 85;

/** 自开球起算分钟数 ≥ 该值且仍为 LIVE：提示前端「可能已完赛、等库 status」 */
export const LIVE_LIKELY_AWAITING_FINISHED_MINUTES = 100;

export type LiveStatusSyncHint = {
  elapsedMinutesSinceKickoff: number;
  /** `status===LIVE` 且开球已久：库可能尚未翻到 `FINISHED`，勿把 UI 分钟数顶死在 90 */
  likelyAwaitingFinishedTransition: boolean;
};

/**
 * 供列表 / 详情 / intel meta：不修改权威 `status`，仅给前端时钟与同步风险提示。
 */
export function computeLiveStatusSyncHint(input: {
  status: MatchStatus;
  kickoffTime: Date;
  now?: Date;
}): LiveStatusSyncHint | null {
  const terminal: MatchStatus[] = [
    MatchStatus.FINISHED,
    MatchStatus.CANCELLED,
    MatchStatus.POSTPONED,
  ];
  if (terminal.includes(input.status)) return null;

  const now = input.now ?? new Date();
  const kickMs = input.kickoffTime.getTime();
  if (!Number.isFinite(kickMs)) return null;

  const elapsed = Math.max(0, Math.floor((now.getTime() - kickMs) / 60_000));

  if (input.status === MatchStatus.LIVE) {
    return {
      elapsedMinutesSinceKickoff: elapsed,
      likelyAwaitingFinishedTransition:
        elapsed >= LIVE_LIKELY_AWAITING_FINISHED_MINUTES,
    };
  }

  return {
    elapsedMinutesSinceKickoff: elapsed,
    likelyAwaitingFinishedTransition: false,
  };
}

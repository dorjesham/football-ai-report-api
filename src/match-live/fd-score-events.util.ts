import type { LiveEventV1 } from './live-event.types';
import { liveEventDedupKey } from './live-event-dedup.util';

/** 比分变化 → 合成进球事件（FD 无分钟级事件流） */
export function syntheticGoalsFromScoreDelta(args: {
  prevHome: number | null;
  prevAway: number | null;
  home: number | null;
  away: number | null;
  minuteHint?: number | null;
}): LiveEventV1[] {
  const out: LiveEventV1[] = [];
  const ph = args.prevHome;
  const pa = args.prevAway;
  const h = args.home;
  const a = args.away;
  if (h == null || a == null || ph == null || pa == null) return out;
  const dh = h - ph;
  const da = a - pa;
  const minute = args.minuteHint ?? null;

  for (let i = 0; i < dh; i++) {
    const item: LiveEventV1 = {
      id: '',
      source: 'SYNTHETIC_SCORE',
      minute,
      extraMinute: null,
      type: 'Goal',
      detail: 'Score update (Football-Data)',
      teamSide: 'home',
      teamName: null,
      playerName: null,
      assistName: null,
    };
    item.id = `${liveEventDedupKey(item)}|${i}`;
    out.push(item);
  }
  for (let i = 0; i < da; i++) {
    const item: LiveEventV1 = {
      id: '',
      source: 'SYNTHETIC_SCORE',
      minute,
      extraMinute: null,
      type: 'Goal',
      detail: 'Score update (Football-Data)',
      teamSide: 'away',
      teamName: null,
      playerName: null,
      assistName: null,
    };
    item.id = `${liveEventDedupKey(item)}|${i}`;
    out.push(item);
  }
  return out;
}

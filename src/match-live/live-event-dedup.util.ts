import type { LiveEventV1 } from './live-event.types';

export function liveEventDedupKey(e: LiveEventV1): string {
  return [
    e.source,
    e.minute ?? 'x',
    e.extraMinute ?? '0',
    e.type,
    e.teamSide ?? 'n',
    e.playerName ?? '',
    e.detail ?? '',
  ].join('|');
}

export function dedupeLiveEvents(items: LiveEventV1[]): LiveEventV1[] {
  const seen = new Set<string>();
  const out: LiveEventV1[] = [];
  for (const e of items) {
    const k = liveEventDedupKey(e);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  out.sort((a, b) => {
    const ma = a.minute ?? 999;
    const mb = b.minute ?? 999;
    if (ma !== mb) return ma - mb;
    return (a.extraMinute ?? 0) - (b.extraMinute ?? 0);
  });
  return out;
}

export function mergeLiveEventLists(...lists: LiveEventV1[][]): LiveEventV1[] {
  return dedupeLiveEvents(lists.flat());
}

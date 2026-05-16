import type { LiveEventV1 } from './live-event.types';

const SIDE_CN: Record<string, string> = {
  home: '主队',
  away: '客队',
};

export function buildCommentaryLines(events: LiveEventV1[], maxLines = 40): string[] {
  const sorted = [...events].sort((a, b) => {
    const ma = a.minute ?? 999;
    const mb = b.minute ?? 999;
    if (ma !== mb) return ma - mb;
    return (a.extraMinute ?? 0) - (b.extraMinute ?? 0);
  });
  const lines: string[] = [];
  for (const e of sorted.slice(-maxLines)) {
    const min =
      e.minute != null ?
        e.extraMinute ?
          `${e.minute}+${e.extraMinute}'`
        : `${e.minute}'`
      : '';
    const side = e.teamSide ? SIDE_CN[e.teamSide] ?? '' : e.teamName ?? '';
    const who = e.playerName ? `，${e.playerName}` : '';
    const type = e.type || '事件';
    const detail = e.detail ? `（${e.detail}）` : '';
    const prefix = min ? `${min} ` : '';
    lines.push(`${prefix}${side}${who} — ${type}${detail}`.trim());
  }
  return lines;
}

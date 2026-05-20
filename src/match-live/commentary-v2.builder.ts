import type { LiveEventV1 } from './live-event.types';

export type CommentaryLineV2 = {
  eventId: string;
  minute: number | null;
  extraMinute: number | null;
  text: string;
  severity: 'goal' | 'card' | 'sub' | 'var' | 'info';
  teamSide: 'home' | 'away' | null;
};

const SIDE_CN: Record<string, string> = {
  home: '主队',
  away: '客队',
};

function formatMinute(e: LiveEventV1): string {
  if (e.minute == null) return '';
  return e.extraMinute ? `${e.minute}+${e.extraMinute}'` : `${e.minute}'`;
}

function eventSeverity(type: string, detail: string | null): CommentaryLineV2['severity'] {
  const t = type.toLowerCase();
  const d = (detail ?? '').toLowerCase();
  if (t.includes('goal') || d.includes('goal')) return 'goal';
  if (t.includes('card') || d.includes('card')) return 'card';
  if (t.includes('subst') || d.includes('subst')) return 'sub';
  if (t.includes('var') || d.includes('var')) return 'var';
  return 'info';
}

function eventTextCn(e: LiveEventV1): string {
  const side = e.teamSide ? SIDE_CN[e.teamSide] ?? '' : e.teamName ?? '场上';
  const who = e.playerName ? e.playerName : '';
  const t = (e.type || '').toLowerCase();
  const d = (e.detail ?? '').toLowerCase();

  if (t.includes('goal') || d.includes('goal')) {
    if (d.includes('own')) return `${side} ${who} 乌龙球！`.trim();
    if (d.includes('penalty')) return `${side} ${who} 点球破门！`.trim();
    return `${side} ${who} 进球！`.trim();
  }
  if (d.includes('yellow') && d.includes('red')) {
    return `${side} ${who} 两黄变一红被罚下`.trim();
  }
  if (t.includes('card') || d.includes('card')) {
    if (d.includes('red')) return `${side} ${who} 红牌！`.trim();
    return `${side} ${who} 黄牌`.trim();
  }
  if (t.includes('subst') || d.includes('subst')) {
    const assist = e.assistName ? `，换上 ${e.assistName}` : '';
    return `${side} 换人：${who}${assist}`.trim();
  }
  if (t.includes('var') || d.includes('var')) {
    return `${side} VAR 介入：${e.detail ?? e.type}`.trim();
  }
  const detail = e.detail ? `（${e.detail}）` : '';
  return `${side} ${who} ${e.type}${detail}`.trim();
}

export function buildCommentaryV2(events: LiveEventV1[]): CommentaryLineV2[] {
  const sorted = [...events].sort((a, b) => {
    const ma = a.minute ?? 999;
    const mb = b.minute ?? 999;
    if (ma !== mb) return ma - mb;
    return (a.extraMinute ?? 0) - (b.extraMinute ?? 0);
  });
  return sorted.map((e) => ({
    eventId: e.id,
    minute: e.minute,
    extraMinute: e.extraMinute,
    text: `${formatMinute(e) ? `${formatMinute(e)} ` : ''}${eventTextCn(e)}`.trim(),
    severity: eventSeverity(e.type, e.detail),
    teamSide: e.teamSide,
  }));
}

export function filterNewCommentaryLines(
  lines: CommentaryLineV2[],
  knownEventIds: string[],
): CommentaryLineV2[] {
  const known = new Set(knownEventIds);
  return lines.filter((l) => !known.has(l.eventId));
}

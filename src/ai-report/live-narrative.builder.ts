import { MatchStatus } from '@prisma/client';
import type { MatchLiveResponse } from '../match-live/match-live.service';
import type { LiveEventV1 } from '../match-live/live-event.types';
import type {
  FactClaim,
  LiveNarrativeStructuredV1,
  SourcePointer,
} from './schemas/structured-report.schema';

function findEventForLine(
  events: LiveEventV1[],
  minute: number | null,
  line: string,
): SourcePointer[] {
  if (minute == null) {
    const last = events[events.length - 1];
    return last ? [{ kind: 'live_event', eventId: last.id }] : [];
  }
  const candidates = events.filter((e) => e.minute === minute);
  if (candidates.length === 1) {
    return [{ kind: 'live_event', eventId: candidates[0]!.id }];
  }
  const goalHit = candidates.find((e) => line.includes('Goal') || line.includes('进球'));
  if (goalHit) return [{ kind: 'live_event', eventId: goalHit.id }];
  if (candidates[0]) return [{ kind: 'live_event', eventId: candidates[0].id }];
  return [];
}

export function buildLiveNarrativeStructured(
  live: MatchLiveResponse,
): LiveNarrativeStructuredV1 {
  const events = live.events ?? [];
  const commentary = live.commentary ?? [];

  const timeline: LiveNarrativeStructuredV1['timeline'] = commentary.map((line, idx) => {
    const ev = events[idx];
    const minute = ev?.minute ?? null;
    return {
      minute,
      line,
      pointers: ev
        ? [{ kind: 'live_event', eventId: ev.id }]
        : findEventForLine(events, minute, line),
    };
  });

  const m = live.match;
  const home = m.homeScore ?? 0;
  const away = m.awayScore ?? 0;
  const summary: FactClaim = {
    text: `全场结束，比分 ${home}-${away}；共记录 ${events.length} 条事件。`,
    pointers: [
      { kind: 'score', field: 'match' },
      ...(live.keyMetrics?.home?.shotsOnTarget != null
        ? [{ kind: 'stat' as const, side: 'home' as const, key: 'shotsOnTarget' }]
        : []),
    ],
  };

  if (
    m.status !== MatchStatus.FINISHED &&
    m.status !== MatchStatus.LIVE
  ) {
    summary.text = `当前状态 ${m.status}；已记录 ${events.length} 条事件。`;
  }

  return {
    schema: 'live-narrative-v1',
    timeline,
    summary,
  };
}

import { dedupeLiveEvents } from './live-event-dedup.util';
import type { LiveEventV1 } from './live-event.types';

function ev(partial: Partial<LiveEventV1>): LiveEventV1 {
  return {
    id: partial.id ?? 'x',
    source: partial.source ?? 'API_FOOTBALL',
    minute: partial.minute ?? 10,
    extraMinute: null,
    type: partial.type ?? 'Goal',
    detail: null,
    teamSide: 'home',
    teamName: null,
    playerName: null,
    assistName: null,
  };
}

describe('dedupeLiveEvents', () => {
  it('removes duplicates by key', () => {
    const a = ev({ id: '1|10|Goal|home||' });
    const b = ev({ id: '1|10|Goal|home||' });
    expect(dedupeLiveEvents([a, b])).toHaveLength(1);
  });
});

import { buildCommentaryV2 } from './commentary-v2.builder';
import type { LiveEventV1 } from './live-event.types';

describe('commentary-v2.builder', () => {
  it('maps goal event to Chinese text', () => {
    const events: LiveEventV1[] = [
      {
        id: 'e1',
        source: 'API_FOOTBALL',
        minute: 23,
        extraMinute: null,
        type: 'Goal',
        detail: 'Normal Goal',
        teamSide: 'home',
        teamName: 'Home',
        playerName: 'Tester',
        assistName: null,
      },
    ];
    const lines = buildCommentaryV2(events);
    expect(lines[0]?.text).toContain('进球');
    expect(lines[0]?.severity).toBe('goal');
  });
});

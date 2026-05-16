import { buildCommentaryLines } from './commentary.builder';
import type { LiveEventV1 } from './live-event.types';

describe('buildCommentaryLines', () => {
  it('builds goal line in Chinese', () => {
    const events: LiveEventV1[] = [
      {
        id: '1',
        source: 'API_FOOTBALL',
        minute: 45,
        extraMinute: null,
        type: 'Goal',
        detail: null,
        teamSide: 'home',
        teamName: '主队',
        playerName: '张三',
        assistName: null,
      },
    ];
    const lines = buildCommentaryLines(events);
    expect(lines[0]).toMatch(/45/);
    expect(lines[0]).toMatch(/Goal/);
  });
});

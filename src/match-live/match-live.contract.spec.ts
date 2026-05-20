import { buildCommentaryV2 } from './commentary-v2.builder';
import { buildLiveZoneHeatmap } from './live-zone-heatmap.builder';
import type { LiveEventV1 } from './live-event.types';

describe('match-live-v2 contract shapes', () => {
  it('commentaryV2 lines have required keys', () => {
    const events: LiveEventV1[] = [
      {
        id: 'e1',
        source: 'API_FOOTBALL',
        minute: 10,
        extraMinute: null,
        type: 'Card',
        detail: 'Yellow Card',
        teamSide: 'away',
        teamName: 'Away',
        playerName: 'A',
        assistName: null,
      },
    ];
    const lines = buildCommentaryV2(events);
    expect(lines[0]).toEqual(
      expect.objectContaining({
        minute: 10,
        text: expect.any(String),
        severity: expect.any(String),
        teamSide: 'away',
        eventId: 'e1',
      }),
    );
  });

  it('activityHeatmapLive exposes rows or missing', () => {
    const hm = buildLiveZoneHeatmap({ events: [], playerStats: [] });
    expect(hm.availability).toBe('missing');
    expect(hm.dataQuality).toBe('MISSING');
  });
});

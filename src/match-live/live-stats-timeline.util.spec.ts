import {
  appendLiveStatsTimelinePoint,
  possessionTimelineForBff,
} from './live-stats-timeline.util';

describe('live-stats-timeline.util', () => {
  it('appends and dedupes by elapsed', () => {
    const teamStats = {
      apiFootball: {
        response: [
          {
            statistics: [
              { type: 'Ball Possession', value: '55%' },
              { type: 'Total Shots', value: '3' },
            ],
          },
          {
            statistics: [
              { type: 'Ball Possession', value: '45%' },
              { type: 'Total Shots', value: '2' },
            ],
          },
        ],
      },
    };
    let storage = appendLiveStatsTimelinePoint(null, 10, teamStats);
    storage = appendLiveStatsTimelinePoint(storage, 10, teamStats);
    storage = appendLiveStatsTimelinePoint(storage, 25, teamStats);
    expect(storage.points.length).toBe(2);
    const timeline = possessionTimelineForBff(storage);
    expect(timeline[0]?.homePossession).toBe(55);
  });
});

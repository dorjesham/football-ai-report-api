import { MatchStatus } from '@prisma/client';
import { buildPostMatchStructured } from './post-match-analysis.builder';

describe('buildPostMatchStructured', () => {
  it('builds recap with goals sorted by minute', () => {
    const out = buildPostMatchStructured({
      match: {
        id: 'm1',
        status: MatchStatus.FINISHED,
        homeScore: 2,
        awayScore: 1,
        homeTeamId: 'h',
        awayTeamId: 'a',
        homeTeam: { nameCn: '主队' },
        awayTeam: { nameCn: '客队' },
      },
      facts: {
        htHome: 1,
        htAway: 0,
        ftHome: 2,
        ftAway: 1,
        events: {
          schema: 'match-events-v1',
          items: [
            {
              id: 'e1',
              source: 'API_FOOTBALL',
              minute: 55,
              extraMinute: null,
              type: 'Goal',
              detail: null,
              teamSide: 'away',
              teamName: '客队',
              playerName: 'A',
              assistName: null,
            },
            {
              id: 'e2',
              source: 'API_FOOTBALL',
              minute: 10,
              extraMinute: null,
              type: 'Goal',
              detail: null,
              teamSide: 'home',
              teamName: '主队',
              playerName: 'B',
              assistName: null,
            },
          ],
        },
        teamStats: null,
      },
      prediction: null,
      grading: null,
    });
    expect(out.schema).toBe('post-match-analysis-v1');
    expect(out.recap.some((c) => c.text.includes('2-1'))).toBe(true);
    expect(out.motm.playerName).toBeTruthy();
  });
});

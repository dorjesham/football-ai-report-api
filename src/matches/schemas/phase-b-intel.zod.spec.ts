import {
  FantasyLineupLaboratorySchema,
  RefereeLeagueBenchmarkSchema,
  RefereeTeamRefSampleSchema,
  VenueHistoricalContextSchema,
} from './phase-b-intel.zod';

describe('phase-b-intel zod', () => {
  it('accepts referee league benchmark', () => {
    const r = RefereeLeagueBenchmarkSchema.safeParse({
      sourceMethod: 'LEAGUE_AGGREGATE',
      yellowCardsAvg: 3.8,
      homeWinRate: 0.48,
    });
    expect(r.success).toBe(true);
  });

  it('accepts team ref sample', () => {
    const r = RefereeTeamRefSampleSchema.safeParse({
      teamId: 't1',
      matchesSampled: 3,
      wins: 2,
      draws: 1,
      losses: 0,
      sourceMethod: 'HISTORICAL_MATCHES',
    });
    expect(r.success).toBe(true);
  });

  it('accepts venue historical', () => {
    const r = VenueHistoricalContextSchema.safeParse({
      sourceMethod: 'CALENDAR_MONTH_HOME',
      windowLabel: '12月主场',
      homeWinRate: 0.7,
      sampleSize: 10,
    });
    expect(r.success).toBe(true);
  });

  it('accepts fantasy lineup laboratory with three lineups', () => {
    const r = FantasyLineupLaboratorySchema.safeParse({
      schemaVersion: 1,
      budgetCap: 100,
      lineups: [
        {
          id: '1',
          name: 'A',
          startingXi: [{ playerId: 'a' }, { playerId: 'b' }],
        },
        {
          id: '2',
          name: 'B',
          startingXi: [{ playerId: 'c' }],
        },
        {
          id: '3',
          name: 'C',
          startingXi: [{ playerId: 'd' }],
        },
      ],
    });
    expect(r.success).toBe(true);
  });
});

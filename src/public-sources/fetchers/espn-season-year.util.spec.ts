import { resolveEspnScheduleSeasonYear } from './espn-season-year.util';

describe('resolveEspnScheduleSeasonYear', () => {
  it('parses season code 2025-2026', () => {
    const k = new Date('2026-01-15T12:00:00.000Z');
    expect(resolveEspnScheduleSeasonYear(k, { code: '2025-2026' })).toBe(2025);
  });

  it('falls back to kickoff-based year', () => {
    const k = new Date('2026-01-15T12:00:00.000Z');
    expect(resolveEspnScheduleSeasonYear(k, null)).toBe(2025);
  });
});

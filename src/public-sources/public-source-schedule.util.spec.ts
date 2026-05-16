import {
  isKickoffHorizonInWindow,
  isPostFinishFetchWindow,
  PUBLIC_SOURCE_PHASE_HALF_WINDOW_MS,
} from './public-source-schedule.util';

describe('public-source-schedule.util', () => {
  it('isKickoffHorizonInWindow matches ~48h before kickoff', () => {
    const kickoff = new Date('2026-06-10T12:00:00.000Z');
    const now = new Date(kickoff.getTime() - 48 * 3600000);
    expect(isKickoffHorizonInWindow(now, kickoff, 48)).toBe(true);
  });

  it('isKickoffHorizonInWindow rejects outside window', () => {
    const kickoff = new Date('2026-06-10T12:00:00.000Z');
    const now = new Date(kickoff.getTime() - 48 * 3600000 - PUBLIC_SOURCE_PHASE_HALF_WINDOW_MS - 60000);
    expect(isKickoffHorizonInWindow(now, kickoff, 48)).toBe(false);
  });

  it('isPostFinishFetchWindow via updatedAt', () => {
    const now = new Date('2026-06-10T15:00:00.000Z');
    const kickoff = new Date('2026-06-10T12:00:00.000Z');
    const updatedAt = new Date('2026-06-10T14:50:00.000Z');
    expect(isPostFinishFetchWindow(now, kickoff, 'FINISHED', updatedAt)).toBe(true);
  });

  it('isPostFinishFetchWindow via minutes-after-kickoff', () => {
    const kickoff = new Date('2026-06-10T12:00:00.000Z');
    const now = new Date(kickoff.getTime() + 110 * 60 * 1000);
    const updatedAt = new Date('2026-06-01T00:00:00.000Z');
    expect(isPostFinishFetchWindow(now, kickoff, 'FINISHED', updatedAt)).toBe(true);
  });
});

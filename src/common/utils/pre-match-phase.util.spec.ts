import { resolvePreMatchPhase } from './pre-match-phase.util';

describe('resolvePreMatchPhase', () => {
  it('returns T24 when kickoff is far', () => {
    const now = new Date('2026-05-19T12:00:00Z');
    const kickoff = new Date('2026-05-25T15:00:00Z');
    expect(resolvePreMatchPhase(now, kickoff)).toBe('T24');
  });
});

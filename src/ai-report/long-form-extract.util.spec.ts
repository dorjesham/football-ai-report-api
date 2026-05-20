import {
  extractPostMatchTacticalLong,
  extractPreMatchIntelLong,
} from './long-form-extract.util';

describe('long-form-extract.util', () => {
  const prePayload = {
    preMatchIntelLongV1: {
      markdown: '赛前长文内容。'.repeat(80),
      envelopeHash: 'abc',
      generatedAt: new Date().toISOString(),
    },
  };

  const postPayload = {
    schema: 'post-match-analysis-v1',
    recap: [],
    turningPoints: [],
    motm: { playerName: 'x', teamSide: 'home', rationale: [] },
    keyPlayers: [],
    tacticalLongV1: {
      markdown: '完赛长文'.repeat(80),
      envelopeHash: 'def',
      generatedAt: new Date().toISOString(),
    },
  };

  it('returns full pre-match long when unlocked', () => {
    const out = extractPreMatchIntelLong(prePayload, true);
    expect(out?.markdown.length).toBeGreaterThan(400);
    expect(out?.locked).toBeUndefined();
  });

  it('returns teaser when locked', () => {
    const out = extractPreMatchIntelLong(prePayload, false);
    expect(out?.locked).toBe(true);
    expect(out?.markdown.length).toBeLessThanOrEqual(400);
  });

  it('extracts post-match tactical long', () => {
    const out = extractPostMatchTacticalLong(postPayload, true);
    expect(out?.markdown).toContain('完赛长文');
  });
});

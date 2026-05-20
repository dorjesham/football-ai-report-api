import {
  computeAiReportInputHash,
  aiReportPromptVersion,
} from './ai-report-input-hash.util';

describe('ai-report-input-hash', () => {
  it('same input yields same hash', () => {
    const a = computeAiReportInputHash({
      fixtureJson: { id: 1 },
      injuriesJson: [],
    });
    const b = computeAiReportInputHash({
      fixtureJson: { id: 1 },
      injuriesJson: [],
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('changed field yields different hash', () => {
    const a = computeAiReportInputHash({ lineupsJson: [] });
    const b = computeAiReportInputHash({ lineupsJson: [{ team: 'A' }] });
    expect(a).not.toBe(b);
  });

  it('prompt version is stable', () => {
    expect(aiReportPromptVersion()).toBe('v2-bundle-1');
  });
});

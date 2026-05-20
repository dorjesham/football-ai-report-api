/** v2：pre-match 不再返回 match-detail-pre-unlocked 合成 ui */
describe('match-phase pre-match v2', () => {
  it('documents expected pre-match shape without ui block', () => {
    const sample = {
      schema: 'match-phase-v1',
      deprecated: true,
      phase: 'pre',
      ui: undefined as undefined,
    };
    expect(sample.ui).toBeUndefined();
    expect(sample.deprecated).toBe(true);
  });
});

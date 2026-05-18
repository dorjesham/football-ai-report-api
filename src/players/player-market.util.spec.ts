import { mapPlayerMarketValueFields } from './player-market.util';

describe('mapPlayerMarketValueFields', () => {
  it('reads marketValue from fdSquad.raw in profile', () => {
    expect(
      mapPlayerMarketValueFields({
        fdSquad: { raw: { marketValue: 80_000_000 } },
      }),
    ).toEqual({ marketValue: 80_000_000, marketValueCurrency: 'EUR' });
  });

  it('returns null when missing', () => {
    expect(mapPlayerMarketValueFields(null)).toEqual({
      marketValue: null,
      marketValueCurrency: 'EUR',
    });
  });
});

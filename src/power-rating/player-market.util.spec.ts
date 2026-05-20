import { extractMarketValueEuroFromProfile } from './player-ppr.calculator';

describe('extractMarketValueEuroFromProfile', () => {
  it('reads apiFootball season snapshot market value', () => {
    const mv = extractMarketValueEuroFromProfile({
      apiFootball: {
        seasons: {
          '2025': { marketValueEuro: 12_000_000 },
        },
      },
    });
    expect(mv).toBe(12_000_000);
  });

  it('falls back to fdSquad when present', () => {
    const mv = extractMarketValueEuroFromProfile({
      fdSquad: { raw: { marketValue: 5_000_000 } },
    });
    expect(mv).toBe(5_000_000);
  });
});

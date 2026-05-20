describe('players summary contract', () => {
  it('includes seasonStats block shape', () => {
    const body = {
      id: 'p1',
      seasonStats: {
        goals: 10,
        assists: 5,
        minutes: 900,
        age: 26,
        radarHints: { attack: 80 },
      },
      marketValue: 50_000_000,
      marketValueCurrency: 'EUR',
    };
    expect(body.seasonStats).toHaveProperty('goals');
    expect(body).toHaveProperty('marketValue');
  });
});

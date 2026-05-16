import { normalizeAfEvents } from './af-events-normalizer.util';

describe('normalizeAfEvents', () => {
  it('maps AF goal event', () => {
    const items = normalizeAfEvents([
      {
        time: { elapsed: 23, extra: null },
        team: { id: 1, name: 'Home FC' },
        player: { id: 9, name: 'Striker' },
        assist: { id: 8, name: 'Winger' },
        type: 'Goal',
        detail: 'Normal Goal',
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('Goal');
    expect(items[0].minute).toBe(23);
    expect(items[0].playerName).toBe('Striker');
  });
});

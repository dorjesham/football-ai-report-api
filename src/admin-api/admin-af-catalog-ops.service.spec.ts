import { jsonArrayStatus } from './admin-af-catalog-ops.service';

describe('jsonArrayStatus', () => {
  it('returns missing for null', () => {
    expect(jsonArrayStatus(null)).toBe('missing');
  });

  it('returns empty for empty array', () => {
    expect(jsonArrayStatus([])).toBe('empty');
  });

  it('returns present for non-empty array', () => {
    expect(jsonArrayStatus([{ x: 1 }])).toBe('present');
  });
});

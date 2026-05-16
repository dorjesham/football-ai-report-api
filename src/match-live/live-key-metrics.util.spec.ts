import { enrichKeyMetricsAvailability } from './live-key-metrics.util';

describe('enrichKeyMetricsAvailability', () => {
  it('marks null as unavailable', () => {
    const out = enrichKeyMetricsAvailability({
      home: { possession: 55, shotsTotal: null },
      away: { possession: 45, shotsTotal: 3 },
    });
    expect(out?.home.possession?.availability).toBe('present');
    expect(out?.home.shotsTotal?.availability).toBe('unavailable');
    expect(out?.home.shotsTotal?.value).toBeNull();
  });
});

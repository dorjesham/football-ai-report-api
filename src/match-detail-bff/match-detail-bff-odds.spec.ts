import { buildPaidModule } from './build-paid-module.util';

describe('paidModules.odds liveSnapshots gating', () => {
  it('locks live data for guests', () => {
    const mod = buildPaidModule({
      locked: true,
      hasData: true,
      status: 'present',
      title: '赔率',
      description: 'x',
      source: 'api-football',
      data: null,
    });
    expect(mod.locked).toBe(true);
    expect(mod.data).toBeNull();
  });

  it('exposes prematch and live arrays when unlocked', () => {
    const data = {
      latest: [],
      prematchSnapshots: [{ phase: 'T24', capturedAt: '2026-01-01T00:00:00.000Z', markets: {} }],
      liveSnapshots: [{ capturedAt: '2026-01-01T01:00:00.000Z', markets: {} }],
      disclaimer: '仅供参考',
    };
    const mod = buildPaidModule({
      locked: false,
      hasData: true,
      status: 'present',
      title: '赔率',
      description: 'x',
      source: 'api-football',
      data,
    });
    const payload = mod.data as {
      liveSnapshots: unknown[];
      prematchSnapshots: unknown[];
    };
    expect(payload.liveSnapshots).toHaveLength(1);
    expect(payload.prematchSnapshots).toHaveLength(1);
  });
});

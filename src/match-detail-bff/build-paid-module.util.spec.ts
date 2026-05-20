import { buildPaidModule } from './build-paid-module.util';

describe('buildPaidModule', () => {
  it('nulls data when locked', () => {
    const m = buildPaidModule({
      locked: true,
      hasData: true,
      status: 'present',
      title: '官方预测数据',
      data: { predictions: { percent: {} } },
    });
    expect(m.locked).toBe(true);
    expect(m.data).toBeNull();
    expect(m.hasData).toBe(true);
  });

  it('returns data when unlocked', () => {
    const payload = { foo: 1 };
    const m = buildPaidModule({
      locked: false,
      hasData: true,
      status: 'present',
      title: 't',
      source: 'api-football',
      data: payload,
    });
    expect(m.data).toEqual(payload);
  });
});

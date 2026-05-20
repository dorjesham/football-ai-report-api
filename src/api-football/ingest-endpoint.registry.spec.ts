import {
  AF_INGEST_ENDPOINT_REGISTRY,
  registryRequiredForWorldCup,
} from './ingest-endpoint.registry';

describe('ingest-endpoint.registry', () => {
  it('lists WC required endpoints', () => {
    const req = registryRequiredForWorldCup();
    expect(req.length).toBeGreaterThan(10);
    expect(req.some((e) => e.id === 'predictions')).toBe(true);
    expect(req.some((e) => e.id === 'injuries')).toBe(true);
    expect(req.every((e) => e.requiredForWorldCup)).toBe(true);
  });

  it('includes facts_dual_write and match events in registry', () => {
    const ids = AF_INGEST_ENDPOINT_REGISTRY.map((e) => e.id);
    expect(ids).toContain('facts_dual_write');
    expect(ids).toContain('events');
    expect(ids).toContain('coachs');
  });

  it('registry has unique ids', () => {
    const ids = AF_INGEST_ENDPOINT_REGISTRY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

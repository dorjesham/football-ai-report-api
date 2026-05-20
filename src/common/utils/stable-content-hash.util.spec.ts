import { sha256StableJson } from './stable-content-hash.util';

describe('sha256StableJson', () => {
  it('is stable for same object key order', () => {
    const a = sha256StableJson({ b: 1, a: 2 });
    const b = sha256StableJson({ a: 2, b: 1 });
    expect(a).toBe(b);
  });

  it('changes when content changes', () => {
    const a = sha256StableJson({ x: 1 });
    const b = sha256StableJson({ x: 2 });
    expect(a).not.toBe(b);
  });
});

import { parseCorsOriginAllowlist, rawCorsOriginFromEnv } from './cors-origin-env.util';

describe('rawCorsOriginFromEnv', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it('prefers CORS_ORIGIN over APP_PUBLIC_ORIGIN', () => {
    process.env.CORS_ORIGIN = 'https://a.com';
    process.env.APP_PUBLIC_ORIGIN = 'https://b.com';
    expect(rawCorsOriginFromEnv()).toBe('https://a.com');
  });

  it('strips one layer of surrounding quotes on CORS_ORIGIN', () => {
    process.env.CORS_ORIGIN = '"https://app.example.com"';
    delete process.env.APP_PUBLIC_ORIGIN;
    expect(rawCorsOriginFromEnv()).toBe('https://app.example.com');
  });

  it('falls back to APP_PUBLIC_ORIGIN', () => {
    delete process.env.CORS_ORIGIN;
    process.env.APP_PUBLIC_ORIGIN = ' https://web.example.com ';
    expect(rawCorsOriginFromEnv()).toBe('https://web.example.com');
  });

  it('falls back to FRONTEND_ORIGIN when higher-priority keys unset', () => {
    delete process.env.CORS_ORIGIN;
    delete process.env.APP_PUBLIC_ORIGIN;
    process.env.FRONTEND_ORIGIN = 'https://spa.example.com';
    expect(rawCorsOriginFromEnv()).toBe('https://spa.example.com');
  });

  describe('parseCorsOriginAllowlist', () => {
    it('returns empty for comma-only (invalid allowlist)', () => {
      expect(parseCorsOriginAllowlist(', ,')).toEqual([]);
    });

    it('parses quoted comma list', () => {
      expect(parseCorsOriginAllowlist('"https://a.com", https://b.com')).toEqual([
        'https://a.com',
        'https://b.com',
      ]);
    });
  });
});

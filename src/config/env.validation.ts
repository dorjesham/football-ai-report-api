import {
  CORS_RAW_ENV_KEYS,
  corsEnvDiagnosticSummary,
  parseCorsOriginAllowlist,
  rawCorsOriginFromEnv,
} from './cors-origin-env.util';

const JWT_PLACEHOLDERS = new Set([
  'dev',
  'dev-only-change-me',
  'change-me',
  'secret',
  'jwt-secret',
]);

export function validateEnv(_config: Record<string, unknown>) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  if (process.env.NODE_ENV === 'production') {
    const jwt = process.env.JWT_SECRET?.trim();
    if (!jwt || jwt.length < 24) {
      throw new Error(
        'Production requires JWT_SECRET of at least 24 characters (set a strong random value)',
      );
    }
    if (JWT_PLACEHOLDERS.has(jwt)) {
      throw new Error('Production JWT_SECRET must not use a default or trivial placeholder');
    }

    const corsRaw = rawCorsOriginFromEnv();
    const origins = parseCorsOriginAllowlist(corsRaw);
    if (
      origins.length === 0 ||
      corsRaw.trim() === '*' ||
      origins.some((o) => o === '*')
    ) {
      throw new Error(
        `Production requires a non-empty CORS allowlist (no *). Set one of: ${CORS_RAW_ENV_KEYS.join(', ')}. Example: CORS_ORIGIN=https://your-frontend.example.com — Diagnostics: ${corsEnvDiagnosticSummary()}`,
      );
    }

    if (process.env.ENABLE_MOCK_LOGIN === 'true') {
      throw new Error('ENABLE_MOCK_LOGIN must not be true in production');
    }
    if (process.env.ENABLE_SMS_OTP_DEBUG === 'true') {
      throw new Error('ENABLE_SMS_OTP_DEBUG must not be true in production');
    }
    if (process.env.WXPAY_NOTIFY_SKIP_VERIFY === 'true') {
      throw new Error('WXPAY_NOTIFY_SKIP_VERIFY must not be true in production');
    }
    if (process.env.HTTP_THROTTLE_DISABLED === 'true') {
      throw new Error('HTTP_THROTTLE_DISABLED must not be true in production');
    }
  }

  return _config;
}

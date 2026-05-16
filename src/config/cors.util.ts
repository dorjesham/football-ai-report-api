import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { parseCorsOriginAllowlist } from './cors-origin-env.util';

/**
 * production：必须显式逗号分隔白名单，禁止 `*` + credentials。
 * 非 production：`CORS_ORIGIN=*` 时等价于 reflect-any（仅本地/联调）。
 */
export function resolveCorsOrigin(
  nodeEnv: string,
  corsOriginRaw: string | undefined,
): CorsOptions['origin'] {
  const isProd = nodeEnv === 'production';
  const raw = (corsOriginRaw ?? '*').trim() || '*';
  if (isProd) {
    if (!raw || raw === '*') {
      throw new Error(
        'CORS_ORIGIN in production must be an explicit comma-separated allowlist (not * or empty)',
      );
    }
    const list = parseCorsOriginAllowlist(raw);
    if (list.length === 0) {
      throw new Error('CORS_ORIGIN has no valid origins after parsing');
    }
    if (list.some((o) => o === '*')) {
      throw new Error('CORS_ORIGIN must not contain * in production');
    }
    return list;
  }
  if (raw === '*') {
    return true;
  }
  if (raw.includes(',')) {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return raw;
}

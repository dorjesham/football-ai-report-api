/**
 * 去掉 Helm/Sealos 等注入时偶发的整段外层引号（如 `"https://a.com"`）。
 */
export function stripEnvQuotes(s: string): string {
  let t = s.trim();
  if (t.length >= 2) {
    const q = t[0];
    if ((q === '"' || q === "'") && t[t.length - 1] === q) {
      t = t.slice(1, -1).trim();
    }
  }
  return t;
}

/**
 * 逗号分隔多源；每段再剥一层引号。空串、仅逗号、`*` 会得到空数组。
 */
export function parseCorsOriginAllowlist(rawInput: string): string[] {
  const raw = stripEnvQuotes(rawInput);
  if (!raw || raw === '*') return [];
  return raw
    .split(',')
    .map((part) => stripEnvQuotes(part))
    .filter(Boolean);
}

/**
 * 依次读取；与 Sealos / 各平台「键名不一致」时兼容。
 * 全未设置或均为空时返回 ''。
 */
export const CORS_RAW_ENV_KEYS = [
  'CORS_ORIGIN',
  'APP_PUBLIC_ORIGIN',
  'PUBLIC_ORIGIN',
  'FRONTEND_ORIGIN',
  'WEB_ORIGIN',
] as const;

export function rawCorsOriginFromEnv(): string {
  for (const key of CORS_RAW_ENV_KEYS) {
    const v = process.env[key];
    if (v != null && v.trim() !== '') {
      return stripEnvQuotes(v);
    }
  }
  return '';
}

/** production 校验失败时附加：各键是否 unset / empty / 有值（不打印具体 URL） */
export function corsEnvDiagnosticSummary(): string {
  const parts: string[] = [];
  for (const key of CORS_RAW_ENV_KEYS) {
    const v = process.env[key];
    if (v === undefined) parts.push(`${key}=<unset>`);
    else if (v.trim() === '') parts.push(`${key}=<empty>`);
    else parts.push(`${key}=<set,len=${v.trim().length}>`);
  }
  return parts.join('; ');
}

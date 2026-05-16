/** 对筛选对象做稳定序列化，用于 Redis 缓存键（忽略 undefined）。 */
export function stableQueryHash(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const norm: Record<string, unknown> = {};
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined || v === '') continue;
    norm[k] = v;
  }
  return Buffer.from(JSON.stringify(norm), 'utf8').toString('base64url');
}

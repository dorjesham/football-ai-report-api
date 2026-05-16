/** 未设置 PORT / HTTP_PORT / APP_PORT 时：生产 8080（Sealos），否则 3000（本地/Cursor）。 */
export function resolveListenPortNumber(): number {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const fallback = nodeEnv === 'production' ? 8080 : 3000;
  const raw = process.env.PORT || process.env.HTTP_PORT || process.env.APP_PORT;
  if (raw === undefined || String(raw).trim() === '') {
    return fallback;
  }
  const n = parseInt(String(raw).trim(), 10);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    // PORT=0 / NaN / 超大值 会导致 listen 到错误端口，Ingress 仍打 8080 → upstream 111
    console.warn(
      `[resolveListenPortNumber] invalid PORT/HTTP_PORT/APP_PORT=${JSON.stringify(String(raw).trim())}, using ${fallback}`,
    );
    return fallback;
  }
  return n;
}

import { isAxiosError } from 'axios';

/** 和风推荐用请求头传 Key，避免与「专属 API Host」组合时被网关拒绝。 */
export function qweatherApiKeyHeaders(apiKey: string): { 'X-QW-Api-Key': string } {
  return { 'X-QW-Api-Key': apiKey };
}

export function pickQWeatherResponseError(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const d = data as Record<string, unknown>;
  if (d.error && typeof d.error === 'object') {
    const err = d.error as Record<string, unknown>;
    const title = typeof err.title === 'string' ? err.title : '';
    const detail = typeof err.detail === 'string' ? err.detail : '';
    const type = typeof err.type === 'string' ? err.type : '';
    return [title, detail, type ? `(${type})` : ''].filter(Boolean).join(' — ');
  }
  return '';
}

/** 附在「天气同步失败」后的中文排障说明（403 多为 INVALID_HOST） */
export function qweather403Hint(baseUrl: string): string {
  const legacy =
    /devapi\.qweather\.com|api\.qweather\.com|geoapi\.qweather\.com/i.test(baseUrl);
  if (!legacy) return '';
  return (
    ' 当前 QWEATHER_BASE_URL 为公共域名，和风已要求使用控制台「设置」里的专属 API Host（https://*.qweatherapi.com）。' +
    '请将 QWEATHER_BASE_URL 改为该地址并重启服务；QWEATHER_API_KEY 须为同一项目下的凭据。'
  );
}

export function formatAxiosQWeatherFailure(
  e: unknown,
  baseUrl: string,
  requestPath: string,
): string {
  let detail = e instanceof Error ? e.message : String(e);
  if (isAxiosError(e) && e.response?.status) {
    const path = e.config?.url?.split('?')[0] ?? requestPath;
    const bodyHint = pickQWeatherResponseError(e.response.data);
    detail = `HTTP ${e.response.status} (${path})${bodyHint ? ` — ${bodyHint}` : ''}: ${detail}`;
    if (e.response.status === 403) {
      detail += qweather403Hint(baseUrl);
    }
  }
  return detail;
}

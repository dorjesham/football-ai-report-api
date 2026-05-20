import { ApiError } from '../api';

export const LEGACY_PIPELINE_RETIRED = 'LEGACY_PIPELINE_RETIRED';

export function formatApiError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 410 || err.errorCode === LEGACY_PIPELINE_RETIRED) {
      return (
        '该功能已废弃。请改用「拉取本场比赛全部数据」（sync-full）或比赛工作台的推荐操作。' +
        (err.message ? `（${err.message}）` : '')
      );
    }
    return err.message || `请求失败 (${err.status})`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

import { DataSourceType } from '@prisma/client';

/** 是否应对本场拉取 API-Football 单场事实包（MatchFacts / 裁判等） */
export function shouldRunAfMatchFactsSync(match: {
  externalId: string | null;
}): boolean {
  const ext = match.externalId?.trim() ?? '';
  return /^af-f-\d+$/.test(ext);
}

/** 是否应跑 Football-Data 单场 intel（AF-only 下默认永不执行） */
export function shouldRunFootballDataIntelSync(
  match: {
    externalId: string | null;
    dataSource: DataSourceType;
  },
  enableFootballData = false,
): boolean {
  if (!enableFootballData) return false;
  const ext = match.externalId?.trim() ?? '';
  if (!ext) return false;
  if (ext.startsWith('af-')) return false;
  if (match.dataSource === DataSourceType.FOOTBALL_DATA) return true;
  if (/^\d+$/.test(ext)) return true;
  return false;
}

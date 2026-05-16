import { DataQuality, DataSourceType } from '@prisma/client';
import type { MatchPublicBrief } from '../types/match-public-brief';
import type { SourceRecordCreateShape } from './source-record-shape';

/** 站内搜索入口；不解析 HTML、不编造比赛统计。 */
export function buildWorldfootballSearchRecord(
  brief: MatchPublicBrief,
  title: string,
): SourceRecordCreateShape {
  const q = encodeURIComponent(`${brief.homeTeam.nameEn} ${brief.awayTeam.nameEn}`);
  const sourceUrl = `https://www.worldfootball.net/search_quick/?dropdown=spiel&search=${q}`;
  return {
    matchId: brief.id,
    entityType: 'MATCH',
    entityId: brief.id,
    sourceType: DataSourceType.WORLDFOOTBALL,
    sourceName: 'worldfootball.net (search)',
    sourceUrl: sourceUrl.slice(0, 500),
    title,
    content:
      'Worldfootball.net 赛程搜索入口。未自动解析站点正文；若服务端抓取返回 403 等，请在本地浏览器打开链接核实。',
    dataQuality: DataQuality.PUBLIC_DATA,
  };
}

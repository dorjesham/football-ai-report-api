import { DataQuality, DataSourceType } from '@prisma/client';
import type { MatchPublicBrief } from '../types/match-public-brief';
import type { SourceRecordCreateShape } from './source-record-shape';

function isUefaContext(brief: MatchPublicBrief): boolean {
  const blob = [
    brief.competition?.code,
    brief.competition?.nameEn,
    brief.competition?.nameCn,
    brief.tournament?.code,
    brief.tournament?.nameEn,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return (
    /uefa|champions league|europa league|conference league|欧联|欧冠|欧协/.test(blob) ||
    ['CL', 'EL', 'UECL', 'UEFA_CL', 'ECL'].includes(String(brief.competition?.code || '')) ||
    ['CL', 'EL', 'UECL', 'UEFA_CL', 'ECL'].includes(String(brief.tournament?.code || ''))
  );
}

/** 官方站点检索入口（不解析 HTML、不编造正文）。 */
export function buildUefaPortalLinkRecord(
  brief: MatchPublicBrief,
  title: string,
): SourceRecordCreateShape | null {
  if (!isUefaContext(brief)) return null;
  const q = encodeURIComponent(`${brief.homeTeam.nameEn} ${brief.awayTeam.nameEn}`);
  const sourceUrl = `https://www.uefa.com/search.html?q=${q}`;
  return {
    matchId: brief.id,
    entityType: 'MATCH',
    entityId: brief.id,
    sourceType: DataSourceType.UEFA,
    sourceName: 'UEFA (portal search)',
    sourceUrl: sourceUrl.slice(0, 500),
    title,
    content:
      '欧足联官网站内搜索入口。本站未自动抓取 UEFA 页面正文；请在浏览器中打开链接后人工核对赛程与官方信息。',
    dataQuality: DataQuality.PUBLIC_DATA,
  };
}

import axios from 'axios';
import { DataQuality, DataSourceType } from '@prisma/client';
import type { MatchPublicBrief } from '../types/match-public-brief';
import type { SourceRecordCreateShape } from './source-record-shape';

export async function fetchWikipediaRecord(
  brief: MatchPublicBrief,
  title: string,
): Promise<SourceRecordCreateShape> {
  let content = '暂无可靠公开数据';
  let sourceUrl: string | undefined;
  try {
    const q = encodeURIComponent(
      `${brief.homeTeam.nameEn} ${brief.awayTeam.nameEn} football`,
    );
    sourceUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&exintro&explaintext&titles=${q}`;
    const { data } = await axios.get(sourceUrl, { timeout: 12000 });
    const pages = data?.query?.pages;
    const first = pages && (Object.values(pages)[0] as { extract?: string });
    if (first?.extract) {
      content = first.extract.slice(0, 8000);
    }
  } catch {
    content = '维基抓取失败，已记录占位；不影响主流程。';
  }

  return {
    matchId: brief.id,
    entityType: 'MATCH',
    entityId: brief.id,
    sourceType: DataSourceType.WIKIPEDIA,
    sourceName: 'Wikipedia',
    sourceUrl: sourceUrl?.slice(0, 500),
    title,
    content,
    dataQuality: DataQuality.PUBLIC_DATA,
  };
}

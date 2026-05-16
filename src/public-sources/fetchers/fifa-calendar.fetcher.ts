import axios from 'axios';
import { DataQuality, DataSourceType } from '@prisma/client';
import type { MatchPublicBrief } from '../types/match-public-brief';
import { matchHomeAwayToPair } from './team-match.util';
import type { SourceRecordCreateShape } from './source-record-shape';

function ymdIso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type FifaName = { Locale?: string; Description?: string };

type FifaResult = {
  IdMatch?: string;
  CompetitionName?: FifaName[];
  SeasonName?: FifaName[];
  Date?: string;
  LocalDate?: string;
  Home?: {
    TeamName?: FifaName[];
    ShortClubName?: string;
    Abbreviation?: string;
    Score?: number;
  };
  Away?: {
    TeamName?: FifaName[];
    ShortClubName?: string;
    Abbreviation?: string;
    Score?: number;
  };
  HomeTeamScore?: number | null;
  AwayTeamScore?: number | null;
  Stadium?: { Name?: FifaName[]; CityName?: FifaName[] };
};

function label(n?: FifaName[]): string {
  return (n?.[0]?.Description || '').trim();
}

function pickFifaMatch(rows: FifaResult[], brief: MatchPublicBrief): FifaResult | null {
  for (const r of rows) {
    const h = label(r.Home?.TeamName) || r.Home?.ShortClubName || r.Home?.Abbreviation || '';
    const a = label(r.Away?.TeamName) || r.Away?.ShortClubName || r.Away?.Abbreviation || '';
    if (h && a && matchHomeAwayToPair(h, a, brief)) return r;
  }
  return null;
}

async function fetchFifaPage(from: string, to: string, token?: string | null) {
  const params = new URLSearchParams({ from, to, language: 'en' });
  if (token) params.set('ContinuationToken', token);
  const sourceUrl = `https://api.fifa.com/api/v3/calendar/matches?${params.toString()}`;
  const { data } = await axios.get<{
    Results?: FifaResult[];
    ContinuationToken?: string | null;
  }>(sourceUrl, { timeout: 18000 });
  return { data, sourceUrl };
}

export async function fetchFifaCalendarRecord(
  brief: MatchPublicBrief,
  title: string,
): Promise<SourceRecordCreateShape> {
  const from = ymdIso(new Date(brief.kickoffTime.getTime() - 86400000));
  const to = ymdIso(new Date(brief.kickoffTime.getTime() + 86400000));

  const merged: FifaResult[] = [];
  let lastUrl = '';
  let token: string | null | undefined;
  for (let page = 0; page < 3; page++) {
    try {
      const { data, sourceUrl } = await fetchFifaPage(from, to, token);
      lastUrl = sourceUrl;
      merged.push(...(data.Results ?? []));
      token = data.ContinuationToken;
      if (!token) break;
    } catch {
      break;
    }
  }

  const fallbackUrl = `https://api.fifa.com/api/v3/calendar/matches?from=${from}&to=${to}&language=en`;

  const hit = pickFifaMatch(merged, brief);
  if (!hit) {
    return {
      matchId: brief.id,
      entityType: 'MATCH',
      entityId: brief.id,
      sourceType: DataSourceType.FIFA,
      sourceName: 'FIFA (calendar API)',
      sourceUrl: (lastUrl || fallbackUrl).slice(0, 500),
      title,
      content:
        'FIFA 公开日历接口在查询窗口内未匹配到本场双方（常见于仅覆盖部分赛事/时区窗口）。不影响主流程。',
      dataQuality: DataQuality.PUBLIC_DATA,
    };
  }

  const comp = label(hit.CompetitionName);
  const season = label(hit.SeasonName);
  const stadium = label(hit.Stadium?.Name);
  const city = label(hit.Stadium?.CityName);
  const h = label(hit.Home?.TeamName) || hit.Home?.ShortClubName || '';
  const a = label(hit.Away?.TeamName) || hit.Away?.ShortClubName || '';
  const hs = hit.HomeTeamScore ?? hit.Home?.Score;
  const as = hit.AwayTeamScore ?? hit.Away?.Score;
  const lines = [
    comp && `赛事: ${comp}`,
    season && `赛季: ${season}`,
    `对阵: ${h} vs ${a}`,
    hit.Date && `日期(UTC 字段): ${hit.Date}`,
    hit.LocalDate && `当地日期字段: ${hit.LocalDate}`,
    hs != null && as != null ? `比分(如有): ${hs} - ${as}` : null,
    stadium && `球场: ${stadium}`,
    city && `城市: ${city}`,
    hit.IdMatch && `FIFA IdMatch: ${hit.IdMatch}`,
    '',
    '（以上内容来自 api.fifa.com 公开 JSON，仅供背景参考。）',
  ].filter(Boolean) as string[];

  return {
    matchId: brief.id,
    entityType: 'MATCH',
    entityId: brief.id,
    sourceType: DataSourceType.FIFA,
    sourceName: 'FIFA (calendar API)',
    sourceUrl: lastUrl.slice(0, 500),
    title,
    content: lines.join('\n').slice(0, 8000),
    dataQuality: DataQuality.PUBLIC_DATA,
  };
}

import axios from 'axios';
import { DataQuality, DataSourceType } from '@prisma/client';
import type { MatchPublicBrief } from '../types/match-public-brief';
import { matchHomeAwayToPair } from './team-match.util';
import type { SourceRecordCreateShape } from './source-record-shape';
import { resolveEspnSoccerSlug } from './espn-league-slugs';
import { tryBuildEspnTeamScheduleSupplement } from './espn-team-roster-schedule.fetcher';

function ymdUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function addDaysUtc(d: Date, delta: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + delta);
  return x;
}

type EspnCompetitor = {
  homeAway?: string;
  team?: { displayName?: string; abbreviation?: string; shortDisplayName?: string };
};

type EspnEvent = {
  id?: string;
  name?: string;
  shortName?: string;
  date?: string;
  status?: { type?: { description?: string; completed?: boolean } };
  competitions?: Array<{ venue?: { fullName?: string }; competitors?: EspnCompetitor[] }>;
  links?: Array<{ href?: string; rel?: string[] }>;
};

function pickEvent(events: EspnEvent[] | undefined, brief: MatchPublicBrief): EspnEvent | null {
  if (!events?.length) return null;
  for (const ev of events) {
    const comps = ev.competitions?.[0]?.competitors;
    if (!comps?.length) continue;
    const homeC = comps.find((c) => c.homeAway === 'home')?.team;
    const awayC = comps.find((c) => c.homeAway === 'away')?.team;
    const hName = homeC?.displayName || homeC?.shortDisplayName || '';
    const aName = awayC?.displayName || awayC?.shortDisplayName || '';
    if (hName && aName && matchHomeAwayToPair(hName, aName, brief)) return ev;
  }
  return null;
}

function formatEventText(ev: EspnEvent): string {
  const lines: string[] = [];
  if (ev.name) lines.push(`对阵: ${ev.name}`);
  if (ev.date) lines.push(`开赛(官方时间字段): ${ev.date}`);
  const st = ev.status?.type?.description;
  if (st) lines.push(`状态: ${st}`);
  const venue = ev.competitions?.[0]?.venue?.fullName;
  if (venue) lines.push(`场地: ${venue}`);
  const report = ev.links?.find((l) => l.rel?.includes('summary') || l.href?.includes('/match/'));
  if (report?.href) lines.push(`摘要页: ${report.href}`);
  lines.push('');
  lines.push('（以上内容来自 ESPN 公开 scoreboard JSON，仅供背景参考。）');
  return lines.join('\n').slice(0, 8000);
}

export async function fetchEspnScoreboardRecord(
  brief: MatchPublicBrief,
  title: string,
): Promise<SourceRecordCreateShape> {
  const slug = resolveEspnSoccerSlug(brief);
  if (!slug) {
    return {
      matchId: brief.id,
      entityType: 'MATCH',
      entityId: brief.id,
      sourceType: DataSourceType.ESPN,
      sourceName: 'ESPN (scoreboard)',
      sourceUrl: 'https://www.espn.com/soccer/',
      title,
      content:
        '本场关联赛事/杯赛 code 未映射到 ESPN 联赛 slug（如 PL、CL、WC 等），已跳过 scoreboard 请求。可在后台维护 Competition.code 或 Tournament.code 后重试。',
      dataQuality: DataQuality.PUBLIC_DATA,
    };
  }

  const teamExtra = await tryBuildEspnTeamScheduleSupplement(brief);

  const datesToTry = [0, -1, 1].map((d) => ymdUtc(addDaysUtc(brief.kickoffTime, d)));
  let picked: EspnEvent | null = null;
  let usedUrl: string | undefined;

  for (const dates of datesToTry) {
    const sourceUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${dates}`;
    try {
      const { data } = await axios.get<{ events?: EspnEvent[] }>(sourceUrl, { timeout: 14000 });
      const ev = pickEvent(data?.events, brief);
      if (ev) {
        picked = ev;
        usedUrl = sourceUrl;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!picked) {
    const base =
      '当日 scoreboard 中未匹配到本场双方球队（可能为非 ESPN 覆盖赛事、或开球日跨日）。可打开联赛页人工核对。';
    const content = teamExtra ? `${base}\n\n${teamExtra}` : base;
    return {
      matchId: brief.id,
      entityType: 'MATCH',
      entityId: brief.id,
      sourceType: DataSourceType.ESPN,
      sourceName: 'ESPN (scoreboard)',
      sourceUrl: `https://www.espn.com/soccer/league/_/name/${slug}`.slice(0, 500),
      title,
      content: content.slice(0, 8000),
      dataQuality: DataQuality.PUBLIC_DATA,
    };
  }

  let content = formatEventText(picked);
  if (teamExtra) content = `${content}\n\n${teamExtra}`.slice(0, 8000);

  return {
    matchId: brief.id,
    entityType: 'MATCH',
    entityId: brief.id,
    sourceType: DataSourceType.ESPN,
    sourceName: 'ESPN (scoreboard)',
    sourceUrl: usedUrl?.slice(0, 500),
    title,
    content,
    dataQuality: DataQuality.PUBLIC_DATA,
  };
}

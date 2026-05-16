import axios from 'axios';
import type { MatchPublicBrief } from '../types/match-public-brief';
import { roughTeamMatch } from './team-match.util';
import { resolveEspnSoccerSlug } from './espn-league-slugs';
import { resolveEspnScheduleSeasonYear } from './espn-season-year.util';

type EspnRosterEntry = { id: string; displayName: string; abbreviation?: string };

export async function fetchEspnLeagueTeamRoster(
  slug: string,
  limit = 100,
): Promise<EspnRosterEntry[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/teams`;
  const { data } = await axios.get(url, { timeout: 15000 });
  const raw = (data?.sports?.[0]?.leagues?.[0]?.teams ?? []) as Array<{
    team?: { id?: string; displayName?: string; abbreviation?: string };
  }>;
  return raw
    .slice(0, limit)
    .map((t) => ({
      id: String(t.team?.id ?? ''),
      displayName: String(t.team?.displayName ?? ''),
      abbreviation: t.team?.abbreviation,
    }))
    .filter((t) => t.id && t.displayName);
}

function resolveTeamId(roster: EspnRosterEntry[], brief: MatchPublicBrief, side: 'home' | 'away') {
  const tm = side === 'home' ? brief.homeTeam : brief.awayTeam;
  const labels = [tm.nameEn, tm.nameCn, tm.shortName || ''].filter(Boolean);
  for (const r of roster) {
    if (labels.some((l) => roughTeamMatch(r.displayName, l))) return r.id;
  }
  return null;
}

type EspnSchedEvent = {
  id?: string;
  name?: string;
  date?: string;
  competitions?: Array<{
    competitors?: Array<{ homeAway?: string; team?: { id?: string; displayName?: string } }>;
  }>;
};

function eventInvolvesTeamIds(ev: EspnSchedEvent, a: string, b: string): boolean {
  const comps = ev.competitions?.[0]?.competitors ?? [];
  const ids = new Set(
    comps.map((c) => String(c.team?.id ?? '')).filter(Boolean),
  );
  return ids.has(a) && ids.has(b);
}

function sameCalendarDayUtc(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/**
 * 先拉联赛 roster，再拉主队在该联赛的 schedule，在事件中找同时含主客 ESPN id 且日期贴近开球日的一条。
 * 失败返回 null（不抛错）。
 */
export async function tryBuildEspnTeamScheduleSupplement(
  brief: MatchPublicBrief,
): Promise<string | null> {
  const slug = resolveEspnSoccerSlug(brief);
  if (!slug) return null;
  const seasonYear = resolveEspnScheduleSeasonYear(brief.kickoffTime, brief.season ?? null);
  try {
    const roster = await fetchEspnLeagueTeamRoster(slug);
    const homeId = resolveTeamId(roster, brief, 'home');
    const awayId = resolveTeamId(roster, brief, 'away');
    if (!homeId || !awayId) return null;

    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/teams/${homeId}/schedule?season=${seasonYear}`;
    const { data } = await axios.get<{ events?: EspnSchedEvent[] }>(url, { timeout: 16000 });
    const events = data?.events ?? [];
    const k = brief.kickoffTime;
    const picked =
      events.find(
        (ev) =>
          eventInvolvesTeamIds(ev, homeId, awayId) &&
          ev.date &&
          sameCalendarDayUtc(new Date(ev.date), k),
      ) ||
      events.find((ev) => eventInvolvesTeamIds(ev, homeId, awayId));

    if (!picked) return null;

    const lines = [
      '--- ESPN 队赛程（联赛 roster → 主队 schedule，便于缩小查询范围）---',
      picked.name ? `场次: ${picked.name}` : null,
      picked.date ? `时间字段: ${picked.date}` : null,
      `请求: ${url}`,
      '',
    ].filter(Boolean) as string[];
    return lines.join('\n').slice(0, 4000);
  } catch {
    return null;
  }
}

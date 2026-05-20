import { asRecord } from './af-fixture-match-fields.util';

export type AfH2HMeeting = {
  dateLabel: string;
  competitionLabel: string;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  resultLabel: string;
  note?: string | null;
};

export type AfH2HAggregate = {
  lastMeetingsCount: number;
  homeWins: number;
  draws: number;
  awayWins: number;
};

function formatDateLabel(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (!Number.isFinite(d.getTime())) return dateStr.slice(0, 7);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * 解析 AF headtohead 响应；`perspectiveHomeTeamId` 为当前场次主队 API team id。
 */
export function mapHeadToHeadFixtures(
  response: unknown[],
  perspectiveHomeTeamId: number,
  perspectiveHomeNameCn: string,
): { meetings: AfH2HMeeting[]; aggregate: AfH2HAggregate } {
  const meetings: AfH2HMeeting[] = [];
  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;

  for (const wrap of response) {
    const rec = asRecord(wrap);
    const fixture = asRecord(rec?.fixture);
    const league = asRecord(rec?.league);
    const teams = asRecord(rec?.teams);
    const goals = asRecord(rec?.goals);
    const home = asRecord(teams?.home);
    const away = asRecord(teams?.away);
    const homeId = Number(home?.id);
    const awayId = Number(away?.id);
    const homeGoals = Number(goals?.home);
    const awayGoals = Number(goals?.away);
    if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) continue;

    const homeName = String(home?.name ?? '');
    const awayName = String(away?.name ?? '');
    const competitionLabel = String(league?.name ?? league?.round ?? '');

    let resultLabel = '平局';
    const isCurrentHomeHome = homeId === perspectiveHomeTeamId;
    if (homeGoals > awayGoals) {
      resultLabel = isCurrentHomeHome ? `${perspectiveHomeNameCn}胜` : `${awayName}胜`;
      if (isCurrentHomeHome) homeWins += 1;
      else awayWins += 1;
    } else if (homeGoals < awayGoals) {
      resultLabel = isCurrentHomeHome ? `${awayName}胜` : `${perspectiveHomeNameCn}胜`;
      if (isCurrentHomeHome) awayWins += 1;
      else homeWins += 1;
    } else {
      draws += 1;
    }

    meetings.push({
      dateLabel: formatDateLabel(
        typeof fixture?.date === 'string' ? fixture.date : undefined,
      ),
      competitionLabel,
      homeName,
      awayName,
      homeScore: homeGoals,
      awayScore: awayGoals,
      resultLabel,
      note: null,
    });
  }

  return {
    meetings,
    aggregate: {
      lastMeetingsCount: meetings.length,
      homeWins,
      draws,
      awayWins,
    },
  };
}

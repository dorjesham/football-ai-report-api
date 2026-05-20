import type { MatchFacts, Match } from '@prisma/client';
import { keyMetricsFromAfTeamStats } from '../../match-live/live-key-metrics.util';
import { parseMatchEventsStorage } from '../../match-live/match-events-storage.util';
import type { PostMatchStructuredV1 } from '../schemas/structured-report.schema';
import { POST_MATCH_TACTICAL_LONG_SECTIONS } from '../prompts/post-match-tactical-long.system';
import type {
  PostMatchTacticalEnvelopeV1,
  SectionAvailability,
} from '../schemas/facts-envelope.schema';

type BuildInput = {
  match: Pick<Match, 'id' | 'homeScore' | 'awayScore' | 'kickoffTime' | 'stadium'> & {
    homeTeam?: { nameCn: string } | null;
    awayTeam?: { nameCn: string } | null;
    competition?: { nameCn: string } | null;
  };
  facts: Pick<
    MatchFacts,
    'htHome' | 'htAway' | 'ftHome' | 'ftAway' | 'events' | 'teamStats' | 'lineups'
  > | null;
  structured: PostMatchStructuredV1;
};

function avail(has: boolean, partial = false): SectionAvailability {
  if (has) return 'present';
  if (partial) return 'partial';
  return 'missing';
}

export function buildPostMatchTacticalEnvelope(input: BuildInput): PostMatchTacticalEnvelopeV1 {
  const { match, facts, structured } = input;
  const home = match.homeTeam?.nameCn ?? '主队';
  const away = match.awayTeam?.nameCn ?? '客队';
  const ftH = match.homeScore ?? facts?.ftHome ?? null;
  const ftA = match.awayScore ?? facts?.ftAway ?? null;
  const score =
    ftH != null && ftA != null ? `${ftH}:${ftA}` : '未知';

  const events = parseMatchEventsStorage(facts?.events ?? null).items;
  const goals = events
    .filter((e) => (e.type ?? '').toLowerCase().includes('goal'))
    .map((e) => ({
      minute: e.minute,
      player: e.playerName,
      side: e.teamSide,
      detail: e.detail,
    }));

  const subs = events
    .filter((e) => {
      const t = (e.type ?? '').toLowerCase();
      return t.includes('subst') || (e.detail ?? '').toLowerCase().includes('subst');
    })
    .map((e) => ({
      minute: e.minute,
      player: e.playerName,
      detail: e.detail,
    }));

  const km = keyMetricsFromAfTeamStats(
    (facts?.teamStats as { apiFootball?: unknown })?.apiFootball ?? facts?.teamStats,
  );
  const hasStats = km != null;
  const hasLineups = facts?.lineups != null;
  const hasEvents = events.length > 0;

  const sectionAvailability: Record<string, SectionAvailability> = {};
  for (const title of POST_MATCH_TACTICAL_LONG_SECTIONS) {
    if (title.includes('数据解读')) {
      sectionAvailability[title] = avail(hasStats, !hasStats);
    } else if (title.includes('阵型')) {
      sectionAvailability[title] = avail(hasLineups, false);
    } else if (title.includes('上半场') || title.includes('下半场')) {
      sectionAvailability[title] = avail(hasEvents, !hasEvents);
    } else if (title.includes('球员')) {
      sectionAvailability[title] = avail(structured.keyPlayers.length > 0, true);
    } else {
      sectionAvailability[title] = avail(hasEvents || ftH != null, true);
    }
  }

  return {
    schema: 'post-match-tactical-envelope-v1',
    matchId: match.id,
    sectionAvailability,
    structuredRecap: structured,
    facts: {
      homeTeam: home,
      awayTeam: away,
      finalScore: score,
      competition: match.competition?.nameCn ?? null,
      kickoffTime: match.kickoffTime.toISOString(),
      venue: match.stadium ?? null,
      lineups: facts?.lineups ?? null,
      goals,
      substitutions: subs,
      teamStats: km ?? facts?.teamStats ?? null,
      eventsSummary: events.slice(0, 40).map((e) => ({
        minute: e.minute,
        type: e.type,
        player: e.playerName,
        side: e.teamSide,
      })),
      predictionReview: structured.predictionReview ?? null,
      otherNotes: {
        htScore:
          facts?.htHome != null && facts?.htAway != null
            ? `${facts.htHome}:${facts.htAway}`
            : null,
      },
    },
  };
}

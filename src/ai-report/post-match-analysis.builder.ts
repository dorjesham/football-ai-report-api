import { MatchStatus } from '@prisma/client';
import type {
  MatchPrediction,
  MatchPredictionGrading,
  MatchFacts,
  Match,
} from '@prisma/client';
import { resolveActualOutcome1x2, top1x2Pick } from '../prediction/prediction-grading.util';
import { keyMetricsFromAfTeamStats } from '../match-live/live-key-metrics.util';
import { parseMatchEventsStorage } from '../match-live/match-events-storage.util';
import type { LiveEventV1 } from '../match-live/live-event.types';
import type { FactClaim, PostMatchStructuredV1, SourcePointer } from './schemas/structured-report.schema';

export type PostMatchBuilderInput = {
  match: Pick<
    Match,
    'id' | 'status' | 'homeScore' | 'awayScore' | 'homeTeamId' | 'awayTeamId'
  > & {
    homeTeam?: { nameCn: string } | null;
    awayTeam?: { nameCn: string } | null;
  };
  facts: Pick<
    MatchFacts,
    'htHome' | 'htAway' | 'ftHome' | 'ftAway' | 'events' | 'teamStats'
  > | null;
  prediction: MatchPrediction | null;
  grading: MatchPredictionGrading | null;
};

function claim(text: string, pointers: SourcePointer[]): FactClaim {
  return { text, pointers };
}

function sideLabel(side: 'home' | 'away', match: PostMatchBuilderInput['match']) {
  return side === 'home' ? match.homeTeam?.nameCn ?? '主队' : match.awayTeam?.nameCn ?? '客队';
}

function goalEvents(events: LiveEventV1[]): LiveEventV1[] {
  return events.filter((e) => {
    const t = (e.type ?? '').toLowerCase();
    return t === 'goal' || t.includes('goal');
  });
}

function turningPointEvents(events: LiveEventV1[]): LiveEventV1[] {
  return events.filter((e) => {
    const t = (e.type ?? '').toLowerCase();
    const d = (e.detail ?? '').toLowerCase();
    if (t.includes('goal')) return true;
    if (t.includes('card') && (d.includes('red') || t.includes('red'))) return true;
    if (t.includes('var')) return true;
    if (d.includes('penalty') || t.includes('penalty')) return true;
    return false;
  });
}

function playerScore(events: LiveEventV1[]): Map<string, { name: string; side: 'home' | 'away'; score: number }> {
  const map = new Map<string, { name: string; side: 'home' | 'away'; score: number }>();
  for (const e of events) {
    if (!e.playerName || !e.teamSide) continue;
    const key = `${e.teamSide}|${e.playerName}`;
    const cur = map.get(key) ?? { name: e.playerName, side: e.teamSide, score: 0 };
    const t = (e.type ?? '').toLowerCase();
    const d = (e.detail ?? '').toLowerCase();
    if (t.includes('goal') && !d.includes('missed')) cur.score += 3;
    else if (t.includes('assist')) cur.score += 2;
    else if (t.includes('card') && d.includes('red')) cur.score -= 2;
    else if (t.includes('card') && d.includes('yellow')) cur.score -= 0.5;
    map.set(key, cur);
  }
  return map;
}

export function buildPostMatchStructured(input: PostMatchBuilderInput): PostMatchStructuredV1 {
  const { match, facts, prediction, grading } = input;
  if (match.status !== MatchStatus.FINISHED) {
    throw new Error('Match must be FINISHED for post-match analysis');
  }

  const home = match.homeScore ?? facts?.ftHome ?? 0;
  const away = match.awayScore ?? facts?.ftAway ?? 0;
  const htH = facts?.htHome;
  const htA = facts?.htAway;

  const events = parseMatchEventsStorage(facts?.events ?? null).items;
  const goals = goalEvents(events).sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));

  const recap: FactClaim[] = [
    claim(
      `终场比分 ${home}-${away}。`,
      [{ kind: 'score', field: 'match' }],
    ),
  ];
  if (htH != null && htA != null) {
    recap.push(
      claim(`半场 ${htH}-${htA}。`, [{ kind: 'score', field: 'ht' }]),
    );
  }
  for (const g of goals) {
    const min = g.minute != null ? `${g.minute}'` : '';
    recap.push(
      claim(
        `${min} ${sideLabel(g.teamSide!, match)} ${g.playerName ?? ''} 进球${g.detail ? `（${g.detail}）` : ''}。`.trim(),
        [{ kind: 'live_event', eventId: g.id }],
      ),
    );
  }

  const turningPoints: FactClaim[] = [];
  for (const e of turningPointEvents(events)) {
    const min = e.minute != null ? `${e.minute}'` : '';
    turningPoints.push(
      claim(
        `${min} ${sideLabel(e.teamSide!, match)} — ${e.type}${e.detail ? `（${e.detail}）` : ''}${e.playerName ? `，${e.playerName}` : ''}。`.trim(),
        [{ kind: 'live_event', eventId: e.id }],
      ),
    );
  }

  const scores = [...playerScore(events).values()].sort((a, b) => b.score - a.score);
  const motmEntry = scores[0];
  const motm = motmEntry
    ? {
        playerName: motmEntry.name,
        teamSide: motmEntry.side,
        rationale: [
          claim(
            `${sideLabel(motmEntry.side, match)} ${motmEntry.name} 本场表现突出（规则评分 ${motmEntry.score.toFixed(1)}）。`,
            scores
              .filter((s) => s.name === motmEntry.name)
              .flatMap(() =>
                events
                  .filter((ev) => ev.playerName === motmEntry.name)
                  .map((ev) => ({ kind: 'live_event' as const, eventId: ev.id })),
              )
              .slice(0, 5),
          ),
        ],
      }
    : {
        playerName: '暂无',
        teamSide: 'home' as const,
        rationale: [claim('暂无可靠球员事件数据。', [{ kind: 'score', field: 'match' }])],
      };

  const keyPlayers = scores.slice(0, 5).map((s) => ({
    playerName: s.name,
    teamSide: s.side,
    highlights: [
      claim(
        `${sideLabel(s.side, match)} ${s.name} 关键贡献（评分 ${s.score.toFixed(1)}）。`,
        events
          .filter((ev) => ev.playerName === s.name)
          .slice(0, 3)
          .map((ev) => ({ kind: 'live_event' as const, eventId: ev.id })),
      ),
    ],
  }));

  const predictionReview: FactClaim[] = [];
  if (prediction && grading) {
    const actual = resolveActualOutcome1x2(home, away);
    const pick = top1x2Pick({
      H: prediction.homeWinProbability,
      D: prediction.drawProbability,
      A: prediction.awayWinProbability,
    });
    const metrics = grading.metricsJson as Record<string, unknown> | null;
    const hit = metrics?.hit1x2 === true;
    predictionReview.push(
      claim(
        `赛前模型 Top 选项为 ${pick}，实际赛果 ${actual}；1X2 ${hit ? '命中' : '未命中'}（版本 v${prediction.version}）。`,
        [
          { kind: 'prediction', predictionId: prediction.id, field: 'probabilities' },
          { kind: 'grading', gradingId: grading.id, field: 'hit1x2' },
        ],
      ),
    );
  }

  const km = keyMetricsFromAfTeamStats(
    (facts?.teamStats as { apiFootball?: unknown })?.apiFootball ?? facts?.teamStats,
  );
  if (km?.home.shotsOnTarget != null && km?.away.shotsOnTarget != null) {
    recap.push(
      claim(
        `射正 ${km.home.shotsOnTarget ?? '—'} : ${km.away.shotsOnTarget ?? '—'}。`,
        [
          { kind: 'stat', side: 'home', key: 'shotsOnTarget' },
          { kind: 'stat', side: 'away', key: 'shotsOnTarget' },
        ],
      ),
    );
  }

  return {
    schema: 'post-match-analysis-v1',
    recap,
    turningPoints: turningPoints.length ? turningPoints : [claim('本场无显著转折点记录。', [])],
    motm,
    keyPlayers,
    predictionReview: predictionReview.length ? predictionReview : undefined,
  };
}

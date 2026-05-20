import {
  findPlayerAnytimeGoalOdd,
} from '../../api-football/af-pre-match-mapper.util';
import { poissonProbability } from '../../power-rating/ols-math';
import type { MatchIntelRow } from '../../matches/match-intel.mapper';
import type { MatchIntelPredictionPreview } from '../../matches/match-intel.types';
import type {
  ExtendedMarketsSection,
  SectionAvailability,
} from '../match-detail-pre-unlocked.types';

const HT_XG_RATIO = 0.45;

function resultSide(h: number, a: number): '主' | '平' | '客' {
  if (h > a) return '主';
  if (h < a) return '客';
  return '平';
}

function halfFullGrid(
  homeXg: number,
  awayXg: number,
): ExtendedMarketsSection['halfFullTime'] {
  const htH = homeXg * HT_XG_RATIO;
  const htA = awayXg * HT_XG_RATIO;
  const shH = homeXg * (1 - HT_XG_RATIO);
  const shA = awayXg * (1 - HT_XG_RATIO);
  const maxG = 5;
  const probs = new Map<string, number>();

  for (let h1 = 0; h1 <= maxG; h1 += 1) {
    for (let a1 = 0; a1 <= maxG; a1 += 1) {
      const pHt = poissonProbability(htH, h1) * poissonProbability(htA, a1);
      const ht = resultSide(h1, a1);
      for (let h2 = 0; h2 <= maxG; h2 += 1) {
        for (let a2 = 0; a2 <= maxG; a2 += 1) {
          const pSh = poissonProbability(shH, h2) * poissonProbability(shA, a2);
          const ft = resultSide(h1 + h2, a1 + a2);
          const label = `${ht}/${ft}`;
          probs.set(label, (probs.get(label) ?? 0) + pHt * pSh);
        }
      }
    }
  }

  const combos: Array<{ ht: string; ft: string; label: string }> = [
    { ht: '主', ft: '主', label: '主/主' },
    { ht: '平', ft: '主', label: '平/主' },
    { ht: '平', ft: '平', label: '平/平' },
    { ht: '主', ft: '平', label: '主/平' },
    { ht: '客', ft: '主', label: '客/主' },
    { ht: '平', ft: '客', label: '平/客' },
  ];

  return combos
    .map((c) => ({
      ...c,
      probabilityPct: Math.max(1, Math.round((probs.get(c.label) ?? 0) * 100)),
    }))
    .sort((a, b) => b.probabilityPct - a.probabilityPct);
}

export type PlayerSeasonMetricRow = {
  playerId: string;
  goals: number | null;
  assists: number | null;
  rating: number | null;
};

export function buildExtendedMarketsSection(args: {
  match: MatchIntelRow;
  preview: MatchIntelPredictionPreview | null;
  oddsMarketsJson?: unknown;
  playerSeasonMetrics?: PlayerSeasonMetricRow[];
}): { section: ExtendedMarketsSection; availability: SectionAvailability } {
  const { match, preview, oddsMarketsJson, playerSeasonMetrics = [] } = args;
  const homeXg = preview?.homeExpectedGoals ?? 1.3;
  const awayXg = preview?.awayExpectedGoals ?? 1.1;
  const totalXg = homeXg + awayXg;

  type PlayerSnap = {
    playerId: string;
    last5Goals: number | null;
    last5Assists: number | null;
    player: { nameCn: string };
    team?: { nameCn: string } | null;
  };
  const snaps = match.playerSnapshots as PlayerSnap[];
  const metricByPlayer = new Map(
    playerSeasonMetrics.map((m) => [m.playerId, m]),
  );

  const playerGoals = [...snaps]
    .sort((a, b) => {
      const sa = metricByPlayer.get(a.playerId)?.goals ?? a.last5Goals ?? 0;
      const sb = metricByPlayer.get(b.playerId)?.goals ?? b.last5Goals ?? 0;
      return sb - sa;
    })
    .slice(0, 6)
    .map((snap, idx) => {
      const season = metricByPlayer.get(snap.playerId);
      const goalWeight =
        (season?.goals ?? snap.last5Goals ?? 0) + 1;
      const share =
        totalXg > 0 ?
          goalWeight /
          (snaps.reduce(
            (s, p) =>
              s +
              ((metricByPlayer.get(p.playerId)?.goals ?? p.last5Goals ?? 0) + 1),
            0,
          ) || 1)
        : 0.15;
      const lambda = totalXg * share * 0.35;
      const prob = Math.round(
        (1 - poissonProbability(Math.max(0.05, lambda), 0)) * 100,
      );
      const odd =
        oddsMarketsJson ?
          findPlayerAnytimeGoalOdd(oddsMarketsJson, snap.player.nameCn)
        : null;
      return {
        rank: idx + 1,
        playerId: snap.playerId,
        playerName: snap.player.nameCn,
        teamNameCn: snap.team?.nameCn ?? null,
        odd,
        probabilityPct: Math.min(85, Math.max(8, prob)),
      };
    });

  const section: ExtendedMarketsSection = {
    halfFullTime: halfFullGrid(homeXg, awayXg),
    playerGoals,
    dataQuality: 'MODEL_ESTIMATED',
  };

  const availability: SectionAvailability =
    preview && playerGoals.length >= 2 ? 'present' : preview ? 'partial' : 'missing';

  return { section, availability };
}

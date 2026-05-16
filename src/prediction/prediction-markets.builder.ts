import { MatchOddsSnapshot } from '@prisma/client';
import { extractOdds1x2Teaser } from '../api-football/af-pre-match-mapper.util';

export type PredictionMarketsV1 = {
  schema: 'prediction-markets-v1';
  oddsSnapshotId: string | null;
  oddsPhase: string | null;
  markets: Record<string, unknown>;
};

const PHASE_PRIORITY = ['T1', 'T24', 'LIVE'] as const;

export function pickBestOddsSnapshot(
  snapshots: Pick<MatchOddsSnapshot, 'id' | 'phase' | 'marketsJson' | 'capturedAt'>[],
): Pick<MatchOddsSnapshot, 'id' | 'phase' | 'marketsJson'> | null {
  if (!snapshots.length) return null;
  for (const phase of PHASE_PRIORITY) {
    const hit = snapshots
      .filter((s) => s.phase === phase)
      .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime())[0];
    if (hit) return hit;
  }
  return snapshots.sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime())[0] ?? null;
}

function impliedFromOdd(odd: number | null | undefined): number | null {
  if (odd == null || odd <= 1) return null;
  return Math.round((1 / odd) * 1000) / 10;
}

function edgePct(model: number, implied: number | null): number | null {
  if (implied == null) return null;
  return Math.round((model - implied) * 10) / 10;
}

function findMarketValues(
  marketsJson: unknown,
  nameHints: string[],
): { label: string; odd: number }[] {
  const root = marketsJson as { snapshots?: unknown[] };
  const snaps = Array.isArray(root?.snapshots) ? root.snapshots : [];
  const first = snaps[0] as { bookmakers?: unknown[] } | undefined;
  const books = Array.isArray(first?.bookmakers) ? first.bookmakers : [];
  for (const bm of books) {
    const b = bm as { markets?: unknown[] };
    const markets = Array.isArray(b?.markets) ? b.markets : [];
    for (const m of markets) {
      const mr = m as { name?: string; values?: unknown[] };
      const name = String(mr?.name ?? '').toLowerCase();
      if (!nameHints.some((h) => name.includes(h))) continue;
      const vals = Array.isArray(mr?.values) ? mr.values : [];
      const out: { label: string; odd: number }[] = [];
      for (const v of vals) {
        const vr = v as { value?: string; odd?: string | number };
        const odd = Number(vr?.odd);
        if (!Number.isFinite(odd) || odd <= 1) continue;
        out.push({ label: String(vr?.value ?? ''), odd });
      }
      if (out.length) return out;
    }
  }
  return [];
}

function poissonOverProb(totalXg: number, line: number): number {
  const lambda = Math.max(0.1, totalXg);
  let under = 0;
  const maxGoals = Math.min(12, Math.ceil(line) + 4);
  for (let k = 0; k <= Math.floor(line); k++) {
    let term = 1;
    for (let i = 1; i <= k; i++) term *= lambda / i;
    under += term * Math.exp(-lambda);
  }
  const over = 1 - under;
  return Math.round(Math.max(0, Math.min(1, over)) * 100);
}

function ahLineFromPowerDiff(diff: number): number {
  if (diff >= 18) return -1.5;
  if (diff >= 10) return -1;
  if (diff >= 5) return -0.5;
  if (diff <= -18) return 1.5;
  if (diff <= -10) return 1;
  if (diff <= -5) return 0.5;
  return 0;
}

export function buildPredictionMarkets(args: {
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
  totalExpectedGoals: number;
  homeMatchPower: number | null;
  awayMatchPower: number | null;
  oddsSnapshot: Pick<MatchOddsSnapshot, 'id' | 'phase' | 'marketsJson'> | null;
}): PredictionMarketsV1 {
  const model1x2 = {
    H: args.homeWinProbability,
    D: args.drawProbability,
    A: args.awayWinProbability,
  };

  const impliedTeaser = args.oddsSnapshot ?
    extractOdds1x2Teaser(args.oddsSnapshot.marketsJson)
  : null;
  const implied1x2 =
    impliedTeaser ?
      {
        H: impliedTeaser.home,
        D: impliedTeaser.draw,
        A: impliedTeaser.away,
      }
    : null;

  const edge1x2 =
    implied1x2 ?
      {
        H: edgePct(model1x2.H, implied1x2.H),
        D: edgePct(model1x2.D, implied1x2.D),
        A: edgePct(model1x2.A, implied1x2.A),
      }
    : null;

  const ouLine = 2.5;
  const modelOverProb = poissonOverProb(args.totalExpectedGoals, ouLine);
  const ouVals = args.oddsSnapshot ?
    findMarketValues(args.oddsSnapshot.marketsJson, ['over/under', 'goals over'])
  : [];
  const overOdd = ouVals.find((v) => String(v.label).toLowerCase().includes('over 2.5'))?.odd;
  const impliedOver = impliedFromOdd(overOdd);

  const powerDiff =
    args.homeMatchPower != null && args.awayMatchPower != null ?
      args.homeMatchPower - args.awayMatchPower
    : 0;
  const ahLine = ahLineFromPowerDiff(powerDiff);
  const ahKey = `AH_${String(ahLine).replace('.', '_').replace('-', 'm')}`;
  const ahHomeCover =
    ahLine === 0 ? 50
    : ahLine < 0 ?
      Math.min(85, Math.max(15, args.homeWinProbability + Math.round(Math.abs(ahLine) * 8)))
    : Math.min(85, Math.max(15, args.homeWinProbability - Math.round(Math.abs(ahLine) * 6)));

  const markets: Record<string, unknown> = {
    '1X2': { model: model1x2, implied: implied1x2, edge: edge1x2 },
    OU_2_5: {
      modelOverProb,
      line: ouLine,
      impliedOver,
      edgeOver: edgePct(modelOverProb, impliedOver),
    },
    [ahKey]: {
      line: ahLine,
      modelHomeCoverProb: ahHomeCover,
      powerDiff,
    },
  };

  return {
    schema: 'prediction-markets-v1',
    oddsSnapshotId: args.oddsSnapshot?.id ?? null,
    oddsPhase: args.oddsSnapshot?.phase ?? null,
    markets,
  };
}

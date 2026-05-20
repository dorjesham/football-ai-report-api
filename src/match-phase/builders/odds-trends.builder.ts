import {
  extractAsianHandicapDecimals,
  extractOdds1x2Decimals,
} from '../../api-football/af-pre-match-mapper.util';
import type {
  OddsTrendRow,
  OddsTrendsSection,
  SectionAvailability,
} from '../match-detail-pre-unlocked.types';

function impliedFromOdd(odd: number | null | undefined): number | null {
  if (odd == null || odd <= 1) return null;
  return Math.round(odd * 100) / 100;
}

function trendFromDelta(
  newer: number | null,
  older: number | null,
): 'up' | 'down' | 'stable' {
  if (newer == null || older == null) return 'stable';
  const d = newer - older;
  if (d < -0.03) return 'down';
  if (d > 0.03) return 'up';
  return 'stable';
}

function findOverUnderOdds(marketsJson: unknown): {
  over: number | null;
  under: number | null;
  line: number | null;
} {
  const root = marketsJson as { snapshots?: unknown[] };
  const snaps = Array.isArray(root?.snapshots) ? root.snapshots : [];
  const first = snaps[0] as { bookmakers?: unknown[] } | undefined;
  const books = Array.isArray(first?.bookmakers) ? first.bookmakers : [];
  for (const bm of books) {
    const b = bm as { markets?: unknown[] };
    for (const m of Array.isArray(b?.markets) ? b.markets : []) {
      const mr = m as { name?: string; values?: unknown[] };
      const name = String(mr?.name ?? '').toLowerCase();
      if (!name.includes('over') && !name.includes('goal')) continue;
      let over: number | null = null;
      let under: number | null = null;
      for (const v of Array.isArray(mr.values) ? mr.values : []) {
        const vr = v as { value?: string; odd?: string | number };
        const label = String(vr?.value ?? '').toLowerCase();
        const odd = impliedFromOdd(Number(vr?.odd));
        if (label.includes('over 2.5')) over = odd;
        if (label.includes('under 2.5')) under = odd;
      }
      if (over != null || under != null) {
        return { over, under, line: 2.5 };
      }
    }
  }
  return { over: null, under: null, line: 2.5 };
}

export function buildOddsTrendsSection(args: {
  snapshots: Array<{ phase: string; capturedAt: string; markets: unknown }>;
  disclaimer: string;
}): { section: OddsTrendsSection; availability: SectionAvailability } {
  const t24 = args.snapshots.find((s) => s.phase === 'T24');
  const t1 =
    args.snapshots.find((s) => s.phase === 'T1') ??
    args.snapshots[args.snapshots.length - 1];

  const older1x2 = t24 ? extractOdds1x2Decimals(t24.markets) : null;
  const newer1x2 = t1 ? extractOdds1x2Decimals(t1.markets) : null;

  const rows: OddsTrendRow[] = [];

  if (newer1x2) {
    rows.push({
      marketType: '1x2',
      label: '欧赔',
      home: newer1x2.home,
      draw: newer1x2.draw,
      away: newer1x2.away,
      trend: trendFromDelta(newer1x2.home, older1x2?.home ?? null),
    });
  }

  const olderOu = t24 ? findOverUnderOdds(t24.markets) : { over: null, under: null, line: 2.5 };
  const newerOu = t1 ? findOverUnderOdds(t1.markets) : olderOu;
  rows.push({
    marketType: 'overUnder',
    label: '大小球',
    home: newerOu.over,
    draw: newerOu.line,
    away: newerOu.under,
    trend: trendFromDelta(newerOu.over, olderOu.over),
  });

  const olderAh = t24 ? extractAsianHandicapDecimals(t24.markets) : null;
  const newerAh = t1 ? extractAsianHandicapDecimals(t1.markets) : olderAh;
  if (newerAh?.home != null || newerAh?.away != null) {
    rows.push({
      marketType: 'handicap',
      label: newerAh.line != null ? `让球 ${newerAh.line}` : '让球',
      home: newerAh.home,
      draw: newerAh.line,
      away: newerAh.away,
      trend: trendFromDelta(newerAh.home, olderAh?.home ?? null),
    });
  }

  const availability: SectionAvailability =
    t1 && t24 && older1x2 && newer1x2 ? 'present'
    : t1 ? 'partial'
    : 'missing';

  return {
    section: { rows, disclaimer: args.disclaimer },
    availability,
  };
}

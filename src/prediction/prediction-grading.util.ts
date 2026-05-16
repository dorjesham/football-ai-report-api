export type ActualOutcome1x2 = 'H' | 'D' | 'A';

export function resolveActualOutcome1x2(
  homeScore: number,
  awayScore: number,
): ActualOutcome1x2 {
  if (homeScore > awayScore) return 'H';
  if (homeScore < awayScore) return 'A';
  return 'D';
}

export function brierScore1x2(
  probs: { H: number; D: number; A: number },
  actual: ActualOutcome1x2,
): number {
  const pH = probs.H / 100;
  const pD = probs.D / 100;
  const pA = probs.A / 100;
  const yH = actual === 'H' ? 1 : 0;
  const yD = actual === 'D' ? 1 : 0;
  const yA = actual === 'A' ? 1 : 0;
  return (pH - yH) ** 2 + (pD - yD) ** 2 + (pA - yA) ** 2;
}

export function top1x2Pick(probs: { H: number; D: number; A: number }): ActualOutcome1x2 {
  const entries: [ActualOutcome1x2, number][] = [
    ['H', probs.H],
    ['D', probs.D],
    ['A', probs.A],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0]![0];
}

export function flatRoi1x2(args: {
  pick: ActualOutcome1x2;
  actual: ActualOutcome1x2;
  odds: { H?: number | null; D?: number | null; A?: number | null };
}): number | null {
  const odd =
    args.pick === 'H' ? args.odds.H
    : args.pick === 'D' ? args.odds.D
    : args.odds.A;
  if (odd == null || odd <= 1) return null;
  return args.pick === args.actual ? odd - 1 : -1;
}

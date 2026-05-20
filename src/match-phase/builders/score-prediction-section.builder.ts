import type {
  ScorePredictionSection,
  SectionAvailability,
} from '../match-detail-pre-unlocked.types';
import type { MatchIntelPredictionPreview } from '../../matches/match-intel.types';

export function buildScorePredictionSection(args: {
  preview: MatchIntelPredictionPreview | null;
  predictionMarkets: Record<string, unknown> | null;
}): { section: ScorePredictionSection; availability: SectionAvailability } {
  const marketsRaw = args.predictionMarkets?.markets as Record<string, unknown> | undefined;
  const top6Raw = marketsRaw?.SCORE_TOP6 as
    | { items?: Array<{ score: string; probabilityPct: number }> }
    | undefined;
  const ou = marketsRaw?.OU_2_5 as { modelOverProb?: number; line?: number } | undefined;
  const btts = marketsRaw?.BTTS as { yesPct?: number } | undefined;
  const cs = marketsRaw?.CLEAN_SHEET as { homePct?: number; awayPct?: number } | undefined;

  let ahLine = 0;
  let ahLabel = '平手';
  let ahCover = 50;
  if (marketsRaw) {
    for (const [key, val] of Object.entries(marketsRaw)) {
      if (!key.startsWith('AH_') || !val || typeof val !== 'object') continue;
      const ah = val as {
        line?: number;
        modelHomeCoverProb?: number;
        handicapLabel?: string;
      };
      ahLine = ah.line ?? 0;
      ahCover = ah.modelHomeCoverProb ?? 50;
      ahLabel = ah.handicapLabel ?? `主让${Math.abs(ahLine)}球`;
    }
  }

  const topScores =
    top6Raw?.items?.length ?
      top6Raw.items.slice(0, 6)
    : args.preview ?
      [
        {
          score: `${Math.round(args.preview.homeExpectedGoals)}-${Math.round(args.preview.awayExpectedGoals)}`,
          probabilityPct: Math.max(
            args.preview.homeWinProbability,
            args.preview.awayWinProbability,
          ),
        },
      ]
    : [];

  const section: ScorePredictionSection = {
    topScores,
    markets: {
      overUnder25: {
        line: ou?.line ?? 2.5,
        overPct: ou?.modelOverProb ?? 50,
      },
      btts: { yesPct: btts?.yesPct ?? 50 },
      handicap: { line: ahLine, label: ahLabel, homeCoverPct: ahCover },
      cleanSheet: {
        homePct: cs?.homePct ?? 25,
        awayPct: cs?.awayPct ?? 25,
      },
    },
  };

  const availability: SectionAvailability =
    topScores.length >= 6 && args.preview ? 'present'
    : args.preview ? 'partial'
    : 'missing';

  return { section, availability };
}

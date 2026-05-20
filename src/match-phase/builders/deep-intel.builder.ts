import type { MatchIntelRow } from '../../matches/match-intel.mapper';
import type { MatchIntelPredictionPreview } from '../../matches/match-intel.types';
import { calculateScoreDistribution, poissonProbability } from '../../power-rating/ols-math';
import type {
  DeepIntelSection,
  SectionAvailability,
} from '../match-detail-pre-unlocked.types';

function parseSocialSupport(rawOutput: unknown): {
  homeSupportPct: number | null;
  awaySupportPct: number | null;
  topics: string[];
} {
  if (!rawOutput || typeof rawOutput !== 'object') {
    return { homeSupportPct: null, awaySupportPct: null, topics: [] };
  }
  const o = rawOutput as Record<string, unknown>;
  const home =
    typeof o.homeSupportPct === 'number' ? o.homeSupportPct : null;
  const away =
    typeof o.awaySupportPct === 'number' ? o.awaySupportPct : null;
  const topics = Array.isArray(o.topics) ?
    o.topics.map((t) => String(t)).filter(Boolean).slice(0, 6)
  : [];
  return { homeSupportPct: home, awaySupportPct: away, topics };
}

export function buildDeepIntelSection(args: {
  match: MatchIntelRow;
  preview: MatchIntelPredictionPreview | null;
}): {
  section: DeepIntelSection & { dataQuality: string };
  availability: SectionAvailability;
} {
  const { match, preview } = args;
  const homeXg = preview?.homeExpectedGoals ?? 1.3;
  const awayXg = preview?.awayExpectedGoals ?? 1.1;
  const totalXg = homeXg + awayXg;
  const tempo = preview?.tempoIndex ?? 55;
  const openPlayBoost = Math.min(8, Math.round(tempo / 15));

  const firstGoalMethod = [
    {
      label: '运动战进球',
      probabilityPct: Math.min(78, 68 + openPlayBoost),
    },
    {
      label: '定位球破门',
      probabilityPct: Math.min(28, Math.round(14 + totalXg * 2)),
    },
    {
      label: '点球',
      probabilityPct: Math.max(4, Math.round(5 + tempo / 40)),
    },
    {
      label: '乌龙球',
      probabilityPct: 4,
    },
  ];

  const firstGoalTime = [
    { interval: '1-15分钟', probabilityPct: Math.round(18 + totalXg * 2) },
    { interval: '16-30分钟', probabilityPct: Math.round(16 + tempo / 8) },
    { interval: '31-45分钟', probabilityPct: Math.round(14 + homeXg * 2) },
    { interval: '46-60分钟', probabilityPct: Math.round(16 + awayXg * 2) },
    { interval: '61-75分钟', probabilityPct: Math.round(14 + totalXg) },
    { interval: '76-90分钟', probabilityPct: Math.max(10, 100 - (18 + 16 + 14 + 16 + 14)) },
  ];

  const refSnap = match.refereeSnapshot;
  const y = refSnap?.yellowCardsAvg;
  let styleLabel = '适中';
  if (y != null && y >= 4.5) styleLabel = '偏严';
  else if (y != null && y <= 3) styleLabel = '偏松';
  const refereeBlock =
    refSnap ?
      {
        nameCn: refSnap.referee?.nameCn ?? null,
        matchesCount: refSnap.matchesCount ?? null,
        styleLabel,
        yellowCardsAvg: y ?? null,
        redCardsAvg: refSnap.redCardsAvg ?? null,
        penaltiesAvg: refSnap.penaltiesAvg ?? null,
      }
    : null;

  const homeWin = preview?.homeWinProbability ?? 50;
  const awayWin = preview?.awayWinProbability ?? 30;
  const socialParsed = parseSocialSupport(match.socialGuide?.rawOutput);
  const tags: string[] = [...socialParsed.topics];
  if (match.socialGuide?.xiaohongshuTitle) tags.push(match.socialGuide.xiaohongshuTitle);
  if (match.competition?.code) tags.push(`#${match.competition.code}`);
  tags.push(`#${match.homeTeam.nameCn}`, `#${match.awayTeam.nameCn}`);

  const scoreDist = calculateScoreDistribution(homeXg, awayXg);
  const exactGoalsMap = new Map<number, number>();
  for (const item of scoreDist.scoreDistribution) {
    const total = item.homeGoals + item.awayGoals;
    const pct = Math.round(item.probability * 100);
    exactGoalsMap.set(total, (exactGoalsMap.get(total) ?? 0) + pct);
  }
  const exactGoals = [0, 1, 2, 3, 4, 5].map((goals) => ({
    goals,
    probabilityPct: exactGoalsMap.get(goals) ?? (goals === 2 ? 22 : 8),
  }));

  const pNoGoal = poissonProbability(totalXg / 2, 0);
  const firstGoalLate = Math.round((1 - pNoGoal * 0.4) * 30);

  const section: DeepIntelSection & { dataQuality: string } = {
    firstGoalMethod,
    firstGoalTime: firstGoalTime.map((row, i) =>
      i === 5 ?
        { ...row, probabilityPct: Math.max(10, firstGoalLate) }
      : row,
    ),
    corners: {
      over95Pct: Math.min(72, Math.round(totalXg * 13 + tempo / 10)),
      over85Pct: Math.min(82, Math.round(totalXg * 17 + tempo / 8)),
      homeAdvantagePct: Math.min(65, Math.round(homeWin * 0.85)),
    },
    cards: {
      yellowOver35Pct:
        refSnap?.yellowCardsAvg ?
          Math.min(78, Math.round(refSnap.yellowCardsAvg * 14))
        : Math.min(55, Math.round(28 + tempo / 5)),
      yellowOver15Pct:
        refSnap?.yellowCardsAvg ?
          Math.min(85, Math.round(refSnap.yellowCardsAvg * 18))
        : 62,
      redHomePct: refSnap?.redCardsAvg ?
        Math.min(18, Math.round(refSnap.redCardsAvg * 25))
      : 8,
      redAwayPct: refSnap?.redCardsAvg ?
        Math.min(18, Math.round(refSnap.redCardsAvg * 22))
      : 10,
    },
    exactGoals,
    referee: refereeBlock,
    sentiment: {
      homeSupportPct:
        socialParsed.homeSupportPct ??
        Math.min(75, homeWin + 10),
      awaySupportPct:
        socialParsed.awaySupportPct ??
        Math.min(65, awayWin + 8),
      tags: tags.slice(0, 6),
    },
    dataQuality:
      socialParsed.homeSupportPct != null ? 'PUBLIC_DATA' : 'MODEL_ESTIMATED',
  };

  const availability: SectionAvailability = preview ? 'present' : 'partial';

  return { section, availability };
}

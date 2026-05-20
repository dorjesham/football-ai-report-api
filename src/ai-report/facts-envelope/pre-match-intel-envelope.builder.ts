import type { MatchLlmDossier } from '../../match-llm-dossier/match-llm-dossier.types';
import { PRE_MATCH_INTEL_LONG_SECTIONS } from '../prompts/pre-match-intel-long.system';
import type {
  PreMatchIntelEnvelopeV1,
  SectionAvailability,
} from '../schemas/facts-envelope.schema';

function avail(present: boolean, partial = false): SectionAvailability {
  if (present) return 'present';
  if (partial) return 'partial';
  return 'missing';
}

export function buildPreMatchIntelEnvelope(
  matchId: string,
  dossier: MatchLlmDossier,
  extras?: {
    headToHead?: {
      summary: string | null;
      homeWins: number | null;
      draws: number | null;
      awayWins: number | null;
    } | null;
    injuriesJson?: unknown;
  },
): PreMatchIntelEnvelopeV1 {
  const home = dossier.layers.teams.home.nameCn;
  const away = dossier.layers.teams.away.nameCn;
  const hs = dossier.layers.teamSnapshots.home;
  const as = dossier.layers.teamSnapshots.away;
  const pred = dossier.layers.prediction as Record<string, unknown> | null;

  const hasForm = !!(hs?.recentForm || as?.recentForm);
  const hasH2h = !!extras?.headToHead?.summary;
  const hasInjuries =
    extras?.injuriesJson != null &&
    (Array.isArray(extras.injuriesJson)
      ? extras.injuriesJson.length > 0
      : typeof extras.injuriesJson === 'object');
  const hasPred = pred != null;

  const sectionAvailability: Record<string, SectionAvailability> = {};
  for (const title of PRE_MATCH_INTEL_LONG_SECTIONS) {
    if (title.includes('数据趋势')) {
      sectionAvailability[title] = avail(hasForm || hasPred, !hasForm);
    } else if (title.includes('伤停')) {
      sectionAvailability[title] = avail(hasInjuries, false);
    } else if (title.includes('剧本') || title.includes('对位')) {
      sectionAvailability[title] = avail(hasForm || hasPred, true);
    } else if (title.includes('模型概率')) {
      sectionAvailability[title] = hasPred ? 'present' : 'missing';
    } else if (title.includes('背景') || title.includes('状态')) {
      sectionAvailability[title] = avail(true, !hasForm);
    } else {
      sectionAvailability[title] = avail(true, true);
    }
  }

  return {
    schema: 'pre-match-intel-envelope-v1',
    matchId,
    sectionAvailability,
    dataAvailability: dossier.dataAvailability as Record<string, string>,
    facts: {
      homeTeam: home,
      awayTeam: away,
      kickoffTime: dossier.layers.footballData.kickoffTime,
      competition: dossier.layers.footballData.competitionNameCn ?? null,
      venue: dossier.layers.footballData.stadium ?? null,
      recentForm: {
        home: hs?.recentForm ?? null,
        away: as?.recentForm ?? null,
        homeGoalsForAvg: hs?.goalsForAvg ?? null,
        awayGoalsForAvg: as?.goalsForAvg ?? null,
      },
      homeAwayForm: { home: hs, away: as },
      injuries: extras?.injuriesJson ?? null,
      expectedLineups: {
        playerSnapshotCount: dossier.layers.playerSnapshotsCount,
      },
      keyPlayers: {
        playerIntelligenceCount: dossier.layers.playerIntelligenceCount,
      },
      headToHead: extras?.headToHead ?? null,
      keyStats: {
        prediction: pred
          ? {
              homeWin: pred.homeWinProbability,
              draw: pred.drawProbability,
              awayWin: pred.awayWinProbability,
            }
          : null,
        teamSnapshots: { home: hs, away: as },
      },
      externalFactors: {
        weather: dossier.layers.weather,
        referee: dossier.layers.referee,
        publicDigests: dossier.layers.publicSourceDigests.slice(0, 4),
      },
      modelProbabilities:
        pred && typeof pred.homeWinProbability === 'number'
          ? {
              home: pred.homeWinProbability as number,
              draw: pred.drawProbability as number,
              away: pred.awayWinProbability as number,
              explanation:
                typeof pred.explanation === 'string' ? pred.explanation : undefined,
              modelVersion:
                typeof pred.modelVersion === 'string' ? pred.modelVersion : undefined,
            }
          : undefined,
    },
  };
}

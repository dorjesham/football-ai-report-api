import type { AfTeamComparisonSummary } from '../match-af-raw-bundle/af-predictions-comparison.util';

export type DataAvailabilityStatus = 'present' | 'partial' | 'missing';

export type MatchLlmDossier = {
  matchId: string;
  builtAt: string;
  /** 各维度数据是否足以支撑事实性表述 */
  dataAvailability: Record<string, DataAvailabilityStatus>;
  /** FD 同步 / 公开来源抓取等步骤的非致命错误 */
  preparationWarnings: string[];
  layers: {
    footballData: {
      externalId: string | null;
      status: string;
      kickoffTime: string;
      stadium: string | null;
      homeScore: number | null;
      awayScore: number | null;
      competitionCode: string | null;
      competitionNameCn: string | null;
      round: string | null;
    };
    teams: {
      home: {
        id: string;
        nameCn: string;
        nameEn: string | null;
        displayName: string;
        translationStatus: string;
      };
      away: {
        id: string;
        nameCn: string;
        nameEn: string | null;
        displayName: string;
        translationStatus: string;
      };
    };
    /** API-Football predictions.comparison / percent（非数据库 ELO） */
    afTeamComparison: AfTeamComparisonSummary;
    teamSnapshots: {
      home: Record<string, unknown> | null;
      away: Record<string, unknown> | null;
    };
    prediction: Record<string, unknown> | null;
    weather: Record<string, unknown> | null;
    referee: Record<string, unknown> | null;
    headToHead: Record<string, unknown> | null;
    playerSnapshotsCount: number;
    playerIntelligenceCount: number;
    publicSourceDigests: Array<{
      sourceType: string;
      sourceName: string;
      sourceUrl: string | null;
      title: string | null;
      excerpt: string;
      fetchedAt: string;
    }>;
  };
};

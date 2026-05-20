import { CompetitionLevel, DataSourceType, TournamentType } from '@prisma/client';
import { API_FOOTBALL_LEAGUE_IDS } from '../src/api-football/api-football.constants';
import { DEFAULT_TOURNAMENTS } from '../src/common/constants/default-tournaments';

/** 种子只建目录，不写任何 Match / Team / Player */
export const SEED_SEASONS = [
  { code: '2025-2026', name: '2025-2026', year: 2026, isCurrent: true },
  { code: '2026-wc', name: 'FIFA World Cup 2026', year: 2026, isCurrent: false },
] as const;

export type SeedCompetitionRow = {
  id: string;
  tournamentCode: string;
  seasonCode: string;
  code: string;
  nameCn: string;
  nameEn: string;
  apiSportsLeagueId: number;
  level?: CompetitionLevel;
};

export const SEED_COMPETITIONS: SeedCompetitionRow[] = [
  {
    id: 'seed-comp-pl',
    tournamentCode: 'PL',
    seasonCode: '2025-2026',
    code: 'PL',
    nameCn: '2025-2026 英超',
    nameEn: 'Premier League 2025-26',
    apiSportsLeagueId: API_FOOTBALL_LEAGUE_IDS.PL,
  },
  {
    id: 'seed-comp-pd',
    tournamentCode: 'PD',
    seasonCode: '2025-2026',
    code: 'PD',
    nameCn: '2025-2026 西甲',
    nameEn: 'La Liga 2025-26',
    apiSportsLeagueId: API_FOOTBALL_LEAGUE_IDS.PD,
  },
  {
    id: 'seed-comp-sa',
    tournamentCode: 'SA',
    seasonCode: '2025-2026',
    code: 'SA',
    nameCn: '2025-2026 意甲',
    nameEn: 'Serie A 2025-26',
    apiSportsLeagueId: API_FOOTBALL_LEAGUE_IDS.SA,
  },
  {
    id: 'seed-comp-bl1',
    tournamentCode: 'BL1',
    seasonCode: '2025-2026',
    code: 'BL1',
    nameCn: '2025-2026 德甲',
    nameEn: 'Bundesliga 2025-26',
    apiSportsLeagueId: API_FOOTBALL_LEAGUE_IDS.BL1,
  },
  {
    id: 'seed-comp-fl1',
    tournamentCode: 'FL1',
    seasonCode: '2025-2026',
    code: 'FL1',
    nameCn: '2025-2026 法甲',
    nameEn: 'Ligue 1 2025-26',
    apiSportsLeagueId: API_FOOTBALL_LEAGUE_IDS.FL1,
  },
  {
    id: 'seed-comp-cl',
    tournamentCode: 'UEFA_CL',
    seasonCode: '2025-2026',
    code: 'CL',
    nameCn: '2025-2026 欧冠',
    nameEn: 'UEFA Champions League 2025-26',
    apiSportsLeagueId: API_FOOTBALL_LEAGUE_IDS.CL,
  },
  {
    id: 'seed-comp-el',
    tournamentCode: 'UEFA_EL',
    seasonCode: '2025-2026',
    code: 'EL',
    nameCn: '2025-2026 欧联',
    nameEn: 'UEFA Europa League 2025-26',
    apiSportsLeagueId: API_FOOTBALL_LEAGUE_IDS.EL,
  },
  {
    id: 'seed-comp-uecl',
    tournamentCode: 'UEFA_ECL',
    seasonCode: '2025-2026',
    code: 'UECL',
    nameCn: '2025-2026 欧协联',
    nameEn: 'UEFA Conference League 2025-26',
    apiSportsLeagueId: API_FOOTBALL_LEAGUE_IDS.UECL,
  },
  {
    id: 'seed-comp-wc',
    tournamentCode: 'FIFA_WC',
    seasonCode: '2026-wc',
    code: 'WC',
    nameCn: '2026 世界杯',
    nameEn: 'FIFA World Cup 2026',
    apiSportsLeagueId: API_FOOTBALL_LEAGUE_IDS.WC,
    level: CompetitionLevel.INTERNATIONAL,
  },
];

export { DEFAULT_TOURNAMENTS, TournamentType, DataSourceType };

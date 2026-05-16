import { CompetitionLevel, TournamentType } from '@prisma/client';

/** 与《开发文档》第九章默认赛事一致，供 seed 与 TournamentsService 共用 */
export const DEFAULT_TOURNAMENTS: Array<{
  code: string;
  nameCn: string;
  nameEn: string;
  type: TournamentType;
  level: CompetitionLevel;
  isGlobal?: boolean;
}> = [
  { code: 'PL', nameCn: '英超', nameEn: 'Premier League', type: 'DOMESTIC_LEAGUE', level: 'TIER_1' },
  { code: 'PD', nameCn: '西甲', nameEn: 'La Liga', type: 'DOMESTIC_LEAGUE', level: 'TIER_1' },
  { code: 'SA', nameCn: '意甲', nameEn: 'Serie A', type: 'DOMESTIC_LEAGUE', level: 'TIER_1' },
  { code: 'BL1', nameCn: '德甲', nameEn: 'Bundesliga', type: 'DOMESTIC_LEAGUE', level: 'TIER_1' },
  { code: 'FL1', nameCn: '法甲', nameEn: 'Ligue 1', type: 'DOMESTIC_LEAGUE', level: 'TIER_1' },
  { code: 'UEFA_CL', nameCn: '欧冠', nameEn: 'UEFA Champions League', type: 'CONTINENTAL_CLUB', level: 'TIER_1' },
  { code: 'UEFA_EL', nameCn: '欧联', nameEn: 'UEFA Europa League', type: 'CONTINENTAL_CLUB', level: 'TIER_1' },
  { code: 'UEFA_ECL', nameCn: '欧协联', nameEn: 'UEFA Europa Conference League', type: 'CONTINENTAL_CLUB', level: 'TIER_1' },
  { code: 'UEFA_SUPER_CUP', nameCn: '欧洲超级杯', nameEn: 'UEFA Super Cup', type: 'CONTINENTAL_CLUB', level: 'TIER_1' },
  { code: 'FIFA_WC', nameCn: '世界杯', nameEn: 'FIFA World Cup', type: 'GLOBAL_NATIONAL', level: 'INTERNATIONAL', isGlobal: true },
  { code: 'FIFA_CWC', nameCn: '世俱杯', nameEn: 'FIFA Club World Cup', type: 'GLOBAL_CLUB', level: 'TIER_1', isGlobal: true },
  { code: 'UEFA_EURO', nameCn: '欧洲杯', nameEn: 'UEFA European Championship', type: 'CONTINENTAL_NATIONAL', level: 'INTERNATIONAL', isGlobal: true },
  { code: 'COPA_AMERICA', nameCn: '美洲杯', nameEn: 'Copa America', type: 'CONTINENTAL_NATIONAL', level: 'INTERNATIONAL', isGlobal: true },
  { code: 'AFC_ASIAN_CUP', nameCn: '亚洲杯', nameEn: 'AFC Asian Cup', type: 'CONTINENTAL_NATIONAL', level: 'INTERNATIONAL' },
  { code: 'AFCON', nameCn: '非洲杯', nameEn: 'Africa Cup of Nations', type: 'CONTINENTAL_NATIONAL', level: 'INTERNATIONAL' },
  { code: 'INT_FRIENDLY', nameCn: '国际友谊赛', nameEn: 'International Friendly', type: 'FRIENDLY', level: 'INTERNATIONAL' },
  { code: 'EFL_CHAMPIONSHIP', nameCn: '英冠', nameEn: 'EFL Championship', type: 'DOMESTIC_LEAGUE', level: 'TIER_2' },
  { code: 'SEGUNDA', nameCn: '西乙', nameEn: 'La Liga 2', type: 'DOMESTIC_LEAGUE', level: 'TIER_2' },
  { code: 'SERIE_B', nameCn: '意乙', nameEn: 'Serie B', type: 'DOMESTIC_LEAGUE', level: 'TIER_2' },
  { code: 'BUNDESLIGA_2', nameCn: '德乙', nameEn: '2. Bundesliga', type: 'DOMESTIC_LEAGUE', level: 'TIER_2' },
  { code: 'LIGUE_2', nameCn: '法乙', nameEn: 'Ligue 2', type: 'DOMESTIC_LEAGUE', level: 'TIER_2' },
];

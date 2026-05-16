/**
 * API-Football（api-sports.io）联赛 id 与本地 `Competition.code` 映射。
 * 赛季年：2025-26 对应 `season=2025`（API 惯例）。
 * @see https://www.api-football.com/documentation-v3
 */
export const API_FOOTBALL_LEAGUE_IDS: Record<string, number> = {
  PL: 39,
  PD: 140,
  SA: 135,
  BL1: 78,
  FL1: 61,
  /** 欧冠 */
  CL: 2,
  /** 欧联 */
  EL: 3,
  /** 欧协联 */
  UECL: 848,
  /** FIFA World Cup（api-sports 文档 league id=1） */
  WC: 1,
};

export const API_FOOTBALL_DEFAULT_CODES = [
  'PL',
  'PD',
  'SA',
  'BL1',
  'FL1',
  'CL',
  'EL',
  'UECL',
] as const;

export type ApiFootballCompetitionCode = (typeof API_FOOTBALL_DEFAULT_CODES)[number];

export function leagueIdForCode(code: string): number | undefined {
  return API_FOOTBALL_LEAGUE_IDS[code.toUpperCase()];
}

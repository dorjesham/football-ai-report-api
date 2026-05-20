/** 与 prisma seed `Competition.id` 一致 */
export const LEAGUE_CODE_TO_COMPETITION_ID: Record<string, string> = {
  PL: 'seed-comp-pl',
  PD: 'seed-comp-pd',
  SA: 'seed-comp-sa',
  BL1: 'seed-comp-bl1',
  FL1: 'seed-comp-fl1',
  CL: 'seed-comp-cl',
  EL: 'seed-comp-el',
  UECL: 'seed-comp-uecl',
  WC: 'seed-comp-wc',
};

export function competitionIdToCode(competitionId: string): string | null {
  const id = competitionId.trim();
  for (const [code, compId] of Object.entries(LEAGUE_CODE_TO_COMPETITION_ID)) {
    if (compId === id) return code;
  }
  return null;
}

export const DEFAULT_STANDINGS_CODES = [
  'PL',
  'PD',
  'SA',
  'BL1',
  'FL1',
  'CL',
  'EL',
  'UECL',
  'WC',
] as const;

/** 榜单物化（积分榜 + 射手榜）与 DEFAULT_STANDINGS_CODES 一致 */
export const DEFAULT_LEADERBOARD_CODES = DEFAULT_STANDINGS_CODES;

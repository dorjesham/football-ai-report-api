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
};

export const DEFAULT_STANDINGS_CODES = [
  'PL',
  'PD',
  'SA',
  'BL1',
  'FL1',
  'CL',
  'EL',
] as const;

import type { Match, Competition, Tournament } from '@prisma/client';

export type MatchWithCompetition = Match & {
  competition?: Pick<Competition, 'code'> | null;
  tournament?: Pick<Tournament, 'code'> | null;
};

export function isWorldCupMatch(
  match: MatchWithCompetition | null | undefined,
): boolean {
  if (!match) return false;
  if (match.competition?.code === 'WC') return true;
  if (match.tournament?.code === 'FIFA_WC') return true;
  return false;
}

export const WORLD_CUP_COMPETITION_CODE = 'WC';
export const WORLD_CUP_TOURNAMENT_CODE = 'FIFA_WC';
export const WORLD_CUP_AF_LEAGUE_ID = 1;
export const WORLD_CUP_DEFAULT_SEASON = 2026;

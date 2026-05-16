import { TournamentType } from '@prisma/client';

export function isNationalTournamentContext(
  tournament: { type: TournamentType } | null | undefined,
): boolean {
  if (!tournament) return false;
  return (
    tournament.type === TournamentType.GLOBAL_NATIONAL ||
    tournament.type === TournamentType.CONTINENTAL_NATIONAL
  );
}

export function teamLooksLikeNationalSide(team: {
  wcGroup?: string | null;
  externalId?: string | null;
}): boolean {
  if (team.wcGroup != null && String(team.wcGroup).trim() !== '') return true;
  if (team.externalId?.startsWith('wc26-')) return true;
  return false;
}

export function tournamentExperienceFromWcProfile(wc: unknown): number {
  if (!wc || typeof wc !== 'object' || Array.isArray(wc)) return 52;
  const w = wc as Record<string, unknown>;
  const fr = w.fifaRanking as { worldRank?: unknown } | undefined;
  const wr = fr?.worldRank;
  if (typeof wr === 'number' && Number.isFinite(wr)) {
    if (wr <= 8) return 84;
    if (wr <= 16) return 74;
    if (wr <= 32) return 64;
    return 56;
  }
  return 52;
}

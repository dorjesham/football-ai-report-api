/** ESPN `?season=` 常用「赛季起始自然年」，如 2025-26 → 2025。 */
export function resolveEspnScheduleSeasonYear(
  kickoff: Date,
  season?: { year?: number | null; code?: string | null } | null,
): number {
  const code = season?.code?.trim();
  if (code && /^\d{4}-\d{4}$/.test(code)) {
    return parseInt(code.split('-')[0], 10);
  }
  const m = kickoff.getUTCMonth();
  const y = kickoff.getUTCFullYear();
  return m >= 6 ? y : y - 1;
}

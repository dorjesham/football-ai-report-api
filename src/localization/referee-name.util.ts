/** Normalize AF referee string for EntityTranslation external key. */
export function normalizeRefereeKey(raw: string): string {
  let s = raw.trim().toLowerCase();
  const comma = s.indexOf(',');
  if (comma > 0) s = s.slice(0, comma).trim();
  return s.replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
}

export function parseAfPlayerId(externalId: string | null | undefined): number | null {
  if (!externalId) return null;
  const m = /^af-p-(\d+)$/i.exec(externalId);
  return m ? Number(m[1]) : null;
}

export function parseAfTeamId(
  externalId: string | null | undefined,
  apiFootballTeamId?: number | null,
): number | null {
  if (apiFootballTeamId != null && Number.isFinite(apiFootballTeamId)) {
    return apiFootballTeamId;
  }
  if (!externalId) return null;
  const m = /^af-t-(\d+)$/i.exec(externalId);
  return m ? Number(m[1]) : null;
}

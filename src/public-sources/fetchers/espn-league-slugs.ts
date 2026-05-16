/** Map internal tournament / competition codes to ESPN site.api slug segments. */
export function resolveEspnSoccerSlug(brief: {
  competition?: { code?: string | null } | null;
  tournament?: { code?: string | null } | null;
}): string | null {
  const code = brief.competition?.code || brief.tournament?.code;
  if (!code) return null;
  const map: Record<string, string> = {
    PL: 'eng.1',
    PD: 'esp.1',
    SA: 'ita.1',
    BL1: 'ger.1',
    FL1: 'fra.1',
    CL: 'uefa.champions',
    UEFA_CL: 'uefa.champions',
    WC: 'fifa.world',
    FIFA_WC: 'fifa.world',
    EL: 'uefa.europa',
    UECL: 'uefa.conference',
    ECL: 'uefa.conference',
  };
  return map[code] ?? null;
}

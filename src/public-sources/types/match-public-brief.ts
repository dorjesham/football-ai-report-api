/** Minimal match graph for public-source fetchers (no Prisma import). */
export type MatchPublicBrief = {
  id: string;
  kickoffTime: Date;
  homeTeam: { nameEn: string; nameCn: string; shortName?: string | null };
  awayTeam: { nameEn: string; nameCn: string; shortName?: string | null };
  competition?: {
    code?: string | null;
    nameEn?: string | null;
    nameCn?: string | null;
  } | null;
  tournament?: { code?: string | null; nameEn?: string | null } | null;
  /** 用于 ESPN 队赛程 season= 等；可为空则由开球时间推断赛季起始年。 */
  season?: { year?: number | null; code?: string | null } | null;
};

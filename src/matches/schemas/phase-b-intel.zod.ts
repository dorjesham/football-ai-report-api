import { z } from 'zod';

/** 裁判情报：联赛尺度对照（可为聚合或 AI 估计，须由上游写 `sourceMethod`） */
export const RefereeLeagueBenchmarkSchema = z
  .object({
    sourceMethod: z.enum([
      'LEAGUE_AGGREGATE',
      'AI_ESTIMATE',
      'UNKNOWN',
      /** 同联赛已赛场次抽样拉取 FD 单场详情后统计（见 sync） */
      'FOOTBALL_DATA_COMPETITION_SAMPLE',
      /** 仅本场 FD statistics 两队合计 */
      'FOOTBALL_DATA_SINGLE_MATCH',
    ]),
    confidence: z.number().min(0).max(100).optional(),
    sampleSize: z.number().int().nonnegative().optional(),
    yellowCardsAvg: z.number().nullable().optional(),
    redCardsAvg: z.number().nullable().optional(),
    penaltiesAvg: z.number().nullable().optional(),
    foulsAvg: z.number().nullable().optional(),
    /** 0–1 小数，与 `RefereeSnapshot.homeWinRate` 一致 */
    homeWinRate: z.number().nullable().optional(),
    addedTimeAvg: z.number().nullable().optional(),
    notes: z.string().optional(),
    /** 本场两队 yellow_cards 合计（FD），与联赛样本并存时用 passthrough 保留 */
    thisFixtureYellowTotal: z.number().optional(),
    thisFixtureFoulsTotal: z.number().optional(),
  })
  .passthrough();
export type RefereeLeagueBenchmark = z.infer<typeof RefereeLeagueBenchmarkSchema>;

/** 裁判执法某队的小样本战绩 */
export const RefereeTeamRefSampleSchema = z.object({
  teamId: z.string(),
  teamNameCn: z.string().optional(),
  matchesSampled: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  goalsForAvg: z.number().optional(),
  goalsAgainstAvg: z.number().optional(),
  sourceMethod: z.enum([
    'HISTORICAL_MATCHES',
    'AI_ESTIMATE',
    'UNKNOWN',
    /** FD `/persons/{id}/matches` 等可验证样本 */
    'FOOTBALL_DATA_REFEREE_FIXTURES',
  ]),
  notable: z.string().optional(),
});
export type RefereeTeamRefSample = z.infer<typeof RefereeTeamRefSampleSchema>;

/** 场地：历史同期 / 同月主场等（统计或 AI 归纳） */
export const VenueHistoricalContextSchema = z.object({
  sourceMethod: z.enum([
    'SEASON_HOME_AGGREGATE',
    'CALENDAR_MONTH_HOME',
    'AI_ESTIMATE',
    'UNKNOWN',
    /** 本库 `Match` 已完赛主场、UTC 同月窗口聚合 */
    'DATABASE_HOME_MONTH',
  ]),
  windowLabel: z.string(),
  month: z.number().int().min(1).max(12).optional(),
  homeWinRate: z.number().optional(),
  avgGoalsFor: z.number().optional(),
  cleanSheetRate: z.number().optional(),
  sampleSize: z.number().int().nonnegative().optional(),
  notes: z.string().optional(),
});
export type VenueHistoricalContext = z.infer<typeof VenueHistoricalContextSchema>;

const FantasyLineupPlayerSlotSchema = z.object({
  playerId: z.string(),
  displayName: z.string().optional(),
  price: z.number().optional(),
  predictedPoints: z.number().optional(),
  role: z.string().optional(),
});

/** 单套推荐阵容 */
export const FantasySuggestedLineupSchema = z.object({
  id: z.string(),
  name: z.string(),
  formation: z.string().optional(),
  totalCost: z.number().optional(),
  predictedTotalPoints: z.number().optional(),
  captainPlayerId: z.string().optional(),
  startingXi: z.array(FantasyLineupPlayerSlotSchema).max(15),
  bench: z.array(FantasyLineupPlayerSlotSchema).max(8).optional(),
  rationale: z.string().optional(),
});

/** Fantasy 阵容实验室：预算 + 至多三套阵容 */
export const FantasyLineupLaboratorySchema = z.object({
  schemaVersion: z.literal(1),
  /** FPL 百万预算；0 表示不适用（如仅 FD 大名单） */
  budgetCap: z.number().nonnegative(),
  budgetUnit: z
    .enum(['FPL_MILLIONS', 'ARBITRARY', 'UNKNOWN', 'FOOTBALL_DATA_LINEUP'])
    .optional(),
  summary: z.string().optional(),
  lineups: z.array(FantasySuggestedLineupSchema).min(1).max(5),
});
export type FantasyLineupLaboratory = z.infer<typeof FantasyLineupLaboratorySchema>;

export function parseRefereeLeagueBenchmark(
  raw: unknown,
): RefereeLeagueBenchmark | null {
  const r = RefereeLeagueBenchmarkSchema.safeParse(raw);
  return r.success ? r.data : null;
}

export function parseRefereeTeamRefSample(raw: unknown): RefereeTeamRefSample | null {
  const r = RefereeTeamRefSampleSchema.safeParse(raw);
  return r.success ? r.data : null;
}

export function parseVenueHistoricalContext(raw: unknown): VenueHistoricalContext | null {
  const r = VenueHistoricalContextSchema.safeParse(raw);
  return r.success ? r.data : null;
}

export function parseFantasyLineupLaboratory(raw: unknown): FantasyLineupLaboratory | null {
  const r = FantasyLineupLaboratorySchema.safeParse(raw);
  return r.success ? r.data : null;
}

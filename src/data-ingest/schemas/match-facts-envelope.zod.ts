import { z } from 'zod';

/** 队伍聚合统计（供应商字段名可差异，先宽松收录） */
export const TeamSideStatsSchema = z.object({
  possessionPct: z.number().optional(),
  shots: z.number().optional(),
  shotsOnTarget: z.number().optional(),
  corners: z.number().optional(),
  fouls: z.number().optional(),
  xg: z.number().optional(),
  passes: z.number().optional(),
  passAccuracyPct: z.number().optional(),
}).passthrough();

export const MatchTeamStatsEnvelopeSchema = z.object({
  home: TeamSideStatsSchema.optional(),
  away: TeamSideStatsSchema.optional(),
}).passthrough();

/** DeepSeek / 爬虫二次结构化后的可写入子集（校验失败则丢弃本次写入） */
export const MatchFactsPartialEnvelopeSchema = z.object({
  teamStats: MatchTeamStatsEnvelopeSchema.optional(),
  lineups: z
    .object({
      home: z.unknown().optional(),
      away: z.unknown().optional(),
    })
    .optional(),
  events: z.array(z.record(z.string(), z.unknown())).optional(),
  officials: z.record(z.string(), z.unknown()).optional(),
  venueDetail: z.record(z.string(), z.unknown()).optional(),
  weatherDetail: z.record(z.string(), z.unknown()).optional(),
  externalRefs: z.record(z.string(), z.string()).optional(),
});

export type MatchFactsPartialEnvelope = z.infer<typeof MatchFactsPartialEnvelopeSchema>;

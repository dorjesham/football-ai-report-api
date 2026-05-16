import { z } from 'zod';

export const SourcePointerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('live_event'), eventId: z.string() }),
  z.object({
    kind: z.literal('stat'),
    side: z.enum(['home', 'away']),
    key: z.string(),
  }),
  z.object({
    kind: z.literal('score'),
    field: z.enum(['ft', 'ht', 'match']),
  }),
  z.object({
    kind: z.literal('prediction'),
    predictionId: z.string(),
    field: z.string(),
  }),
  z.object({
    kind: z.literal('grading'),
    gradingId: z.string(),
    field: z.string(),
  }),
]);

export type SourcePointer = z.infer<typeof SourcePointerSchema>;

export const FactClaimSchema = z.object({
  text: z.string(),
  pointers: z.array(SourcePointerSchema),
});

export type FactClaim = z.infer<typeof FactClaimSchema>;

export const PostMatchStructuredV1Schema = z.object({
  schema: z.literal('post-match-analysis-v1'),
  recap: z.array(FactClaimSchema),
  turningPoints: z.array(FactClaimSchema),
  motm: z.object({
    playerName: z.string(),
    teamSide: z.enum(['home', 'away']),
    rationale: z.array(FactClaimSchema),
  }),
  keyPlayers: z.array(
    z.object({
      playerName: z.string(),
      teamSide: z.enum(['home', 'away']),
      highlights: z.array(FactClaimSchema),
    }),
  ),
  predictionReview: z.array(FactClaimSchema).optional(),
});

export type PostMatchStructuredV1 = z.infer<typeof PostMatchStructuredV1Schema>;

export const LiveNarrativeStructuredV1Schema = z.object({
  schema: z.literal('live-narrative-v1'),
  timeline: z.array(
    z.object({
      minute: z.number().nullable(),
      line: z.string(),
      pointers: z.array(SourcePointerSchema),
    }),
  ),
  summary: FactClaimSchema,
});

export type LiveNarrativeStructuredV1 = z.infer<typeof LiveNarrativeStructuredV1Schema>;

export const PolishStructuredReportSchema = z.object({
  sections: z.record(z.string(), z.string()),
  disclaimer: z.string().optional(),
});

export type PolishStructuredReport = z.infer<typeof PolishStructuredReportSchema>;

export const FactCheckResultSchema = z.object({
  pass: z.boolean(),
  checkedAt: z.string(),
  errors: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      pointer: SourcePointerSchema.optional(),
    }),
  ),
});

export type FactCheckResult = z.infer<typeof FactCheckResultSchema>;

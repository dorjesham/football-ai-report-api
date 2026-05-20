import { z } from 'zod';

export const SectionAvailabilitySchema = z.enum(['present', 'partial', 'missing']);

export type SectionAvailability = z.infer<typeof SectionAvailabilitySchema>;

export const PreMatchIntelEnvelopeV1Schema = z.object({
  schema: z.literal('pre-match-intel-envelope-v1'),
  matchId: z.string(),
  sectionAvailability: z.record(z.string(), SectionAvailabilitySchema),
  facts: z.object({
    homeTeam: z.string(),
    awayTeam: z.string(),
    kickoffTime: z.string(),
    competition: z.string().nullable(),
    venue: z.string().nullable(),
    standings: z.unknown().optional(),
    recentForm: z.unknown().optional(),
    homeAwayForm: z.unknown().optional(),
    injuries: z.unknown().optional(),
    expectedLineups: z.unknown().optional(),
    keyPlayers: z.unknown().optional(),
    headToHead: z.unknown().optional(),
    keyStats: z.unknown().optional(),
    externalFactors: z.unknown().optional(),
    modelProbabilities: z
      .object({
        home: z.number(),
        draw: z.number(),
        away: z.number(),
        explanation: z.string().optional(),
        modelVersion: z.string().optional(),
      })
      .optional(),
  }),
  dataAvailability: z.record(z.string(), z.string()).optional(),
});

export type PreMatchIntelEnvelopeV1 = z.infer<typeof PreMatchIntelEnvelopeV1Schema>;

export const PostMatchTacticalEnvelopeV1Schema = z.object({
  schema: z.literal('post-match-tactical-envelope-v1'),
  matchId: z.string(),
  sectionAvailability: z.record(z.string(), SectionAvailabilitySchema),
  facts: z.object({
    homeTeam: z.string(),
    awayTeam: z.string(),
    finalScore: z.string(),
    competition: z.string().nullable(),
    kickoffTime: z.string(),
    venue: z.string().nullable(),
    lineups: z.unknown().optional(),
    goals: z.unknown().optional(),
    substitutions: z.unknown().optional(),
    teamStats: z.unknown().optional(),
    eventsSummary: z.unknown().optional(),
    predictionReview: z.unknown().optional(),
    otherNotes: z.unknown().optional(),
  }),
  structuredRecap: z.unknown().optional(),
});

export type PostMatchTacticalEnvelopeV1 = z.infer<typeof PostMatchTacticalEnvelopeV1Schema>;

export const LongFormOutputSchema = z.object({
  markdown: z.string(),
  sections: z.record(z.string(), z.string()).optional(),
});

export type LongFormOutput = z.infer<typeof LongFormOutputSchema>;

export const PreMatchIntelLongV1Schema = z.object({
  markdown: z.string(),
  sections: z.record(z.string(), z.string()).optional(),
  envelopeHash: z.string(),
  generatedAt: z.string(),
});

export const PostMatchTacticalLongV1Schema = z.object({
  markdown: z.string(),
  sections: z.record(z.string(), z.string()).optional(),
  envelopeHash: z.string(),
  generatedAt: z.string(),
});

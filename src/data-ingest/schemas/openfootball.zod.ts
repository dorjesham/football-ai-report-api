import { z } from 'zod';

/** OpenFootball football.json 联赛文件（单赛季） */
export const OpenFootballLeagueFileSchema = z.object({
  name: z.string(),
  matches: z.array(
    z.object({
      round: z.string().optional(),
      date: z.string(),
      time: z.string().optional(),
      team1: z.string(),
      team2: z.string(),
      score: z
        .object({
          ht: z.tuple([z.number(), z.number()]).optional(),
          ft: z.tuple([z.number(), z.number()]).optional(),
        })
        .optional(),
    }),
  ),
});

export type OpenFootballLeagueFile = z.infer<typeof OpenFootballLeagueFileSchema>;

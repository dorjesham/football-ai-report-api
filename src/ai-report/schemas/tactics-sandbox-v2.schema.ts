import { z } from 'zod';

const SandboxStepSchema = z.object({
  label: z.string(),
  detail: z.string(),
});

const ScenarioCompatSchema = z.object({
  scenarioType: z.string(),
  title: z.string(),
  probability: z.number().min(0).max(100),
  precondition: z.string(),
  process: z.string(),
  possibleScore: z.string().optional(),
  timeline: z.string(),
});

export const TacticalSandboxV2Schema = z.object({
  asciiDiagrams: z
    .array(z.object({ label: z.string(), diagram: z.string() }))
    .max(2)
    .optional()
    .default([]),
  inPossession: z
    .object({
      summary: z.string(),
      steps: z.array(SandboxStepSchema).max(8).optional(),
    })
    .optional(),
  outOfPossession: z
    .object({
      summary: z.string(),
      steps: z.array(SandboxStepSchema).max(8).optional(),
    })
    .optional(),
  transitions: z
    .object({
      attackTransition: z.string().optional(),
      defenseTransition: z.string().optional(),
    })
    .optional(),
  keyMatchups: z
    .array(
      z.object({
        label: z.string(),
        analysis: z.string(),
        edge: z.string().optional(),
      }),
    )
    .min(1)
    .max(6),
  attackPatterns: z
    .array(
      z.object({
        title: z.string(),
        steps: z.array(z.string()).max(6),
        risk: z.string().optional(),
      }),
    )
    .min(1)
    .max(4),
  defensivePlan: z.string(),
  risksAndAdjustments: z.array(z.string()).min(1).max(8),
  conclusion: z.string(),
  scenarios: z.array(ScenarioCompatSchema).min(2).max(6),
});

export type TacticalSandboxV2 = z.infer<typeof TacticalSandboxV2Schema>;

import { z } from "zod";

export const sourceAnchorSchema = z.object({
  quote: z.string().min(1),
  sectionHint: z.string().optional()
});

export const findingSchema = z.object({
  title: z.string().min(1),
  severity: z.enum(["high", "medium", "low"]),
  whyItMatters: z.string().min(1),
  recommendation: z.string().min(1),
  evidence: z.array(sourceAnchorSchema).default([])
});

export const stageResultSchema = z.object({
  summary: z.string().min(1),
  findings: z.array(findingSchema).default([]),
  followUpQuestions: z.array(z.string()).default([]),
  guardrail: z.object({
    hasSufficientEvidence: z.boolean(),
    notes: z.array(z.string()).default([]),
    unsupportedClaims: z.array(z.string()).default([])
  }),
  rawMarkdown: z.string().default("")
});

export type ParsedStageResult = z.infer<typeof stageResultSchema>;

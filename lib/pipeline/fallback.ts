import { AnalysisStageId, StageResult } from "@/lib/types";

const stageLabels: Record<AnalysisStageId, string> = {
  intake: "Normalize input",
  "executive-audit": "Executive audit",
  "ats-match": "ATS match",
  "achievement-mining": "Achievement mining",
  "story-review": "Career story",
  proofread: "Proofread",
  rewrite: "Evidence-safe rewrite"
};

export function buildFallbackStageResult(
  stageId: AnalysisStageId,
  reason: string
): Omit<StageResult, "stageId"> {
  return {
    failed: true,
    summary: `${stageLabels[stageId]} could not be completed with the configured model, so the app returned a transparent fallback state instead of guessing.`,
    findings: [
      {
        title: "Analysis unavailable",
        severity: "medium",
        whyItMatters: "The report should not fabricate model output or present stale results as real analysis.",
        recommendation: `Reconnect the model provider and rerun this stage. Technical reason: ${reason}`,
        evidence: []
      }
    ],
    followUpQuestions: [],
    guardrail: {
      hasSufficientEvidence: false,
      notes: ["Fallback mode preserved correctness by refusing to invent analysis."],
      unsupportedClaims: []
    },
    rawMarkdown: ""
  };
}

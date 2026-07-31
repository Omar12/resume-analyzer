import { StageResult } from "@/lib/types";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function buildScorecard(stageResults: StageResult[]) {
  const allFindings = stageResults.flatMap((stage) => stage.findings);
  const unsupportedClaims = stageResults.flatMap(
    (stage) => stage.guardrail.unsupportedClaims
  ).length;

  const severityPenalty = allFindings.reduce((total, finding) => {
    if (finding.severity === "high") {
      return total + 12;
    }
    if (finding.severity === "medium") {
      return total + 6;
    }
    return total + 2;
  }, 0);

  const overallScore = clamp(92 - severityPenalty, 25, 96);
  const truthfulnessConfidence = clamp(95 - unsupportedClaims * 8, 35, 98);
  const interviewReadiness = clamp(overallScore - unsupportedClaims * 3, 20, 94);

  const atsStage = stageResults.find((stage) => stage.stageId === "ats-match");
  const atsScore = atsStage
    ? clamp(
        90 -
          atsStage.findings.reduce((total, finding) => {
            return total + (finding.severity === "high" ? 10 : finding.severity === "medium" ? 5 : 2);
          }, 0),
        20,
        96
      )
    : undefined;

  return {
    overallScore,
    atsScore,
    truthfulnessConfidence,
    interviewReadiness
  };
}

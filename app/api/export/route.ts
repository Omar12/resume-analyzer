import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SCORE_MAX } from "@/lib/pipeline/scoring";
import { AnalysisReport } from "@/lib/types";

const requestSchema = z.object({
  report: z.any(),
  format: z.enum(["json", "markdown"])
});

function buildMarkdown(report: AnalysisReport) {
  const sections = report.stageResults
    .map((stage) => {
      const findings = stage.findings
        .map(
          (finding) =>
            `- [${finding.severity}] ${finding.title}: ${finding.recommendation}`
        )
        .join("\n");

      const questions = stage.followUpQuestions.map((item) => `- ${item}`).join("\n");

      return `## ${stage.stageId}\n\n${stage.summary}\n\n### Findings\n${findings || "- None"}\n\n### Follow-up questions\n${questions || "- None"}\n`;
    })
    .join("\n");

  return `# Resume Analysis Report

Target role: ${report.roleTarget}
Created at: ${report.createdAt}

## Scorecard

- Overall: ${report.scorecard.overallScore} / ${SCORE_MAX.overallScore}
- ATS: ${
    report.scorecard.atsScore === undefined
      ? "not scored"
      : `${report.scorecard.atsScore} / ${SCORE_MAX.atsScore}`
  }
- Truthfulness confidence: ${report.scorecard.truthfulnessConfidence} / ${SCORE_MAX.truthfulnessConfidence}
- Interview readiness: ${report.scorecard.interviewReadiness} / ${SCORE_MAX.interviewReadiness}

## Top improvements

${report.topImprovements.map((item) => `- ${item}`).join("\n")}

${sections}

## Rewrite draft

${report.rewriteDraft || "_No rewrite available._"}
`;
}

export async function POST(request: NextRequest) {
  const { report, format } = requestSchema.parse(await request.json());

  if (format === "json") {
    return new NextResponse(JSON.stringify(report, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": "attachment; filename=resume-analysis.json"
      }
    });
  }

  return new NextResponse(buildMarkdown(report), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": "attachment; filename=resume-analysis.md"
    }
  });
}

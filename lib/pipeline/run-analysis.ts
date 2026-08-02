import { buildFallbackStageResult } from "@/lib/pipeline/fallback";
import { stageResultSchema } from "@/lib/pipeline/schema";
import { buildScorecard } from "@/lib/pipeline/scoring";
import { PIPELINE_STAGES } from "@/lib/pipeline/stages";
import { STAGE_JSON_SCHEMA_HINT, STAGE_PROMPTS } from "@/lib/prompts/templates";
import { generateJson } from "@/lib/llm";
import {
  AnalysisEvent,
  AnalysisReport,
  AnalyzeRequestPayload,
  StageResult
} from "@/lib/types";

function buildArchitectureNotes() {
  return {
    mvpScope: [
      "Paste-first resume intake with optional job description",
      "Deterministic multi-stage analysis pipeline with explicit progress states",
      "Evidence-aware recommendations and unsupported-claim detection",
      "Markdown rewrite output and export to JSON or Markdown"
    ],
    uxPrinciples: [
      "Make the pipeline legible instead of hiding model work behind a spinner",
      "Separate critique from rewrite so users can inspect evidence before accepting edits",
      "Prefer follow-up questions over speculative improvements"
    ],
    systemDesign: [
      "Next.js App Router UI with server routes for orchestration",
      "Typed pipeline stages and prompt templates shared across API and client",
      "LLM provider adapter isolated behind a single generateJson function"
    ]
  };
}

function buildInputBlock(payload: AnalyzeRequestPayload, stageId: string) {
  return `
Stage: ${stageId}
Target role: ${payload.targetRole ?? "Senior Software Engineer"}

Resume:
${payload.resumeText}

Job description:
${payload.jobDescription ?? "Not provided."}

Follow-up workbook responses:
${payload.followUpContext ?? "Not provided. This is an initial analysis."}

${STAGE_JSON_SCHEMA_HINT}
`.trim();
}

/**
 * Yields each stage the moment it resolves, then the assembled report. The UI
 * shows real progress rather than a spinner, so the stream is the contract.
 */
export async function* streamResumeAnalysis(
  payload: AnalyzeRequestPayload
): AsyncGenerator<AnalysisEvent> {
  const stageResults: StageResult[] = [];
  const targetRole = payload.targetRole?.trim() || "Senior Software Engineer";
  const jobDescription = payload.jobDescription?.trim() || undefined;
  const stages = PIPELINE_STAGES.filter(
    (stage) => stage.id !== "ats-match" || jobDescription
  );

  for (const [index, stage] of stages.entries()) {
    const startedAt = Date.now();

    if (stage.id === "intake") {
      stageResults.push({
        stageId: stage.id,
        durationMs: 0,
        summary:
          "Input captured. Resume text is ready for analysis, and the evidence boundary is set to the submitted document and optional job description only.",
        findings: [
          {
            title: "Source-of-truth locked",
            severity: "low",
            whyItMatters:
              "Grounding every later step in the submitted text reduces hallucinated achievements and unsupported rewrites.",
            recommendation:
              "Keep the resume paste aligned to the latest source document before running the pipeline.",
            evidence: [
              {
                quote: payload.resumeText.slice(0, 160),
                sectionHint: "resume excerpt"
              }
            ]
          }
        ],
        followUpQuestions: [],
        guardrail: {
          hasSufficientEvidence: payload.resumeText.trim().length > 80,
          notes: ["Only submitted text is used as evidence."],
          unsupportedClaims: []
        },
        rawMarkdown: ""
      });
      yield {
        type: "stage",
        index,
        total: stages.length,
        stage: stageResults[stageResults.length - 1]
      };
      continue;
    }

    try {
      const prompt = STAGE_PROMPTS[stage.id]({
        resumeText: payload.resumeText,
        jobDescription,
        targetRole
      });

      const raw = await generateJson({
        system: prompt,
        input: buildInputBlock(payload, stage.id)
      });

      const parsed = stageResultSchema.parse(JSON.parse(raw));

      stageResults.push({
        stageId: stage.id,
        ...parsed,
        durationMs: Date.now() - startedAt
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      stageResults.push({
        stageId: stage.id,
        ...buildFallbackStageResult(stage.id, message),
        durationMs: Date.now() - startedAt
      });
    }

    yield {
      type: "stage",
      index,
      total: stages.length,
      stage: stageResults[stageResults.length - 1]
    };
  }

  const topImprovements = stageResults
    .filter((stage) => !stage.failed)
    .flatMap((stage) => stage.findings)
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 };
      return rank[a.severity] - rank[b.severity];
    })
    .slice(0, 8)
    .map((finding) => finding.recommendation);

  const rewriteDraft =
    stageResults.find((stage) => stage.stageId === "rewrite")?.rawMarkdown || "";

  yield {
    type: "report",
    report: {
      createdAt: new Date().toISOString(),
      roleTarget: targetRole,
      resumeText: payload.resumeText,
      jobDescription,
      scorecard: buildScorecard(stageResults),
      stageResults,
      topImprovements,
      rewriteDraft,
      architectureNotes: buildArchitectureNotes()
    }
  };
}

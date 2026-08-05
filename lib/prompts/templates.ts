import { AnalysisStageId } from "@/lib/types";

export interface PromptContext {
  resumeText: string;
  jobDescription?: string;
  targetRole: string;
}

const baseGuardrails = `
You are part of a resume analysis pipeline. You must not invent jobs, achievements, metrics, dates, certifications, tools, or responsibilities.
Every conclusion must be grounded in the provided resume text and optional job description.
Follow-up workbook responses are user context, not resume evidence. Use them only to check whether a change was applied; never turn them into a resume claim unless that fact also appears in the provided resume.
If evidence is weak, say so explicitly and add targeted follow-up questions instead of guessing.
For each recommendation, cite short direct quotes from the resume as evidence anchors.
If a stronger rewrite would require information not present in the resume, preserve the original claim and add a bracketed note like [needs metric].
Return JSON only.
`.trim();

export const STAGE_PROMPTS: Record<
  Exclude<AnalysisStageId, "intake">,
  (context: PromptContext) => string
> = {
  "executive-audit": (context) => `
${baseGuardrails}

Task: Run an executive resume audit for a ${context.targetRole}.
Evaluate first impression, scannability, professionalism, clarity, strongest accomplishments, weak sections, missing information, and red flags.
Provide 3-6 findings with severity, whyItMatters, recommendation, and evidence.
Also provide an honest summary, up to 5 follow-up questions, and a guardrail object tracking unsupported claims.
`,
  "ats-match": (context) => `
${baseGuardrails}

Task: Compare the resume against the job description for a ${context.targetRole}.
If no job description is supplied, say that ATS matching is unavailable and limit output to generic keyword readiness guidance.
Focus on missing keywords, mismatched terminology, formatting risk, and truthful keyword opportunities.
Provide 3-6 findings with severity, whyItMatters, recommendation, and evidence.
Also provide an honest summary, up to 5 follow-up questions, and a guardrail object tracking unsupported claims.

Job description:
${context.jobDescription ?? "No job description provided."}
`,
  "achievement-mining": (context) => `
${baseGuardrails}

Task: Find vague bullets or responsibilities that could become stronger accomplishments for a ${context.targetRole}.
Do not rewrite with fabricated metrics.
Ask the most useful follow-up questions to uncover business impact, scale, ownership, leadership, speed, reliability, or revenue.
Provide 3-6 findings with severity, whyItMatters, recommendation, and evidence.
Also provide an honest summary, up to 7 follow-up questions, and a guardrail object tracking unsupported claims.
`,
  "story-review": (context) => `
${baseGuardrails}

Task: Review the resume as a career narrative for a ${context.targetRole}.
Assess focus, progression, seniority signals, consistency, and whether the document supports the intended role.
Provide 3-6 findings with severity, whyItMatters, recommendation, and evidence.
Also provide an honest summary, up to 5 follow-up questions, and a guardrail object tracking unsupported claims.
`,
  proofread: (context) => `
${baseGuardrails}

Task: Proofread all submitted material for a ${context.targetRole}. Check the resume, follow-up workbook responses, and uploaded analysis snapshot when present for spelling, grammar, punctuation, inconsistent capitalization, unclear wording, and contradictory terminology.
Do not critique strategy, add achievements, or rewrite whole sections. Report only concrete corrections. For resume corrections, cite the exact resume text as evidence. For corrections in workbook responses or the uploaded analysis snapshot, start the finding title with "Workbook:" or "Analysis:" and leave evidence empty because those sources are not resume evidence.
Provide 0-8 findings, a concise summary, no follow-up questions unless a correction is ambiguous, and a guardrail object.
`,
  rewrite: (context) => `
${baseGuardrails}

Task: Rewrite the resume for a ${context.targetRole} while staying strictly truthful.
Do not add content that is not explicitly supported by the resume.
You may improve wording, ordering, compression, headings, and action verbs.
Include a concise, evidence-based Markdown Summary section (headed ## Summary) at the top of the rewritten resume.
Where evidence is missing, preserve the statement and flag gaps with short bracketed notes.
Return JSON with summary, findings, followUpQuestions, guardrail, and rawMarkdown containing the rewritten resume in Markdown.
`
};

export const STAGE_JSON_SCHEMA_HINT = `
Use this JSON shape:
{
  "summary": "string",
  "findings": [
    {
      "title": "string",
      "severity": "high" | "medium" | "low",
      "whyItMatters": "string",
      "recommendation": "string",
      "evidence": [
        { "quote": "short quote from resume", "sectionHint": "optional" }
      ]
    }
  ],
  "followUpQuestions": ["string"],
  "guardrail": {
    "hasSufficientEvidence": true,
    "notes": ["string"],
    "unsupportedClaims": ["string"]
  },
  "rawMarkdown": "string"
}
`.trim();

import type { AnalysisReport } from "@/lib/types";

const WORKBOOK_TITLE = "# Resume Analysis Follow-up Workbook";

function cleanBlock(value: string | undefined) {
  return (value ?? "")
    .replace(/<!--([\s\S]*?)-->/g, "")
    .replace(/^>\s*_.*_\s*$/gm, "")
    .trim();
}

function section(markdown: string, title: string) {
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const heading = new RegExp(`^## ${escapedTitle}\\s*$`, "m").exec(markdown);
  if (!heading || heading.index === undefined) {
    return "";
  }

  const afterHeading = markdown.slice(heading.index + heading[0].length);
  const nextHeading = afterHeading.search(/^## /m);
  return cleanBlock(nextHeading === -1 ? afterHeading : afterHeading.slice(0, nextHeading));
}

function responseBlocks(markdown: string) {
  return [...markdown.matchAll(/^\*\*(?:Your response|Answer):\*\*\s*$([\s\S]*?)(?=^### |^## |(?![\s\S]))/gm)]
    .map((match) => cleanBlock(match[1]))
    .filter(Boolean);
}

export interface FollowUpWorkbook {
  resumeText: string;
  targetRole?: string;
  jobDescription?: string;
  followUpContext?: string;
  analysisSnapshot?: string;
}

export function buildFollowUpMarkdown(report: AnalysisReport) {
  const suggestions = report.topImprovements
    .map(
      (item, index) => `### Suggestion ${index + 1}

**Recommendation:** ${item}

**Your response:**
<!-- Describe what you changed, what you verified, or why you are not applying this suggestion. -->
> _Write your response here._`
    )
    .join("\n\n");

  const questions = report.stageResults
    .flatMap((stage) =>
      stage.followUpQuestions.map(
        (question, index) => `### ${stage.stageId} question ${index + 1}

**Question:** ${question}

**Answer:**
<!-- Add verified details here, then add any resume-worthy facts to Updated resume. -->
> _Write your answer here._`
      )
    )
    .join("\n\n");

  return `${WORKBOOK_TITLE}

Use this file as a working copy: update the resume below, respond to any useful suggestions or questions, then upload this complete Markdown file for a follow-up analysis. Only facts placed in **Updated resume** are treated as resume evidence; your responses help explain your changes but will not be turned into claims automatically.

## Target role

${report.roleTarget}

## Job description (optional)

${report.jobDescription ?? "<!-- Paste the job description here if you want ATS matching. -->"}

## Updated resume

${report.resumeText}

## Completed suggestions

${suggestions || "No priority suggestions were generated."}

## Follow-up questions

${questions || "No follow-up questions were generated."}

## Original analysis snapshot

Created at: ${report.createdAt}

### Scorecard

- Overall: ${report.scorecard.overallScore}
- Truthfulness confidence: ${report.scorecard.truthfulnessConfidence}
- Interview readiness: ${report.scorecard.interviewReadiness}

${report.stageResults
  .map(
    (stage) => `### ${stage.stageId}\n\n${stage.summary}\n\n${stage.findings
      .map((finding) => `- [${finding.severity}] ${finding.title}: ${finding.recommendation}`)
      .join("\n")}`
  )
  .join("\n\n")}
`;
}

export function parseFollowUpMarkdown(markdown: string): FollowUpWorkbook | null {
  if (!markdown.trimStart().startsWith(WORKBOOK_TITLE)) {
    return null;
  }

  const resumeText = section(markdown, "Updated resume");
  if (resumeText.length < 80) {
    return null;
  }

  const responses = responseBlocks(markdown);
  return {
    resumeText,
    targetRole: section(markdown, "Target role") || undefined,
    jobDescription: section(markdown, "Job description (optional)") || undefined,
    followUpContext: responses.length
      ? responses.map((response, index) => `${index + 1}. ${response}`).join("\n")
      : undefined,
    analysisSnapshot: section(markdown, "Original analysis snapshot").slice(0, 30_000) || undefined
  };
}

export type Severity = "high" | "medium" | "low";

export type AnalysisStageId =
  | "intake"
  | "executive-audit"
  | "ats-match"
  | "achievement-mining"
  | "story-review"
  | "proofread"
  | "rewrite";

export interface StageDefinition {
  id: AnalysisStageId;
  label: string;
  goal: string;
}

export interface SourceAnchor {
  quote: string;
  sectionHint?: string;
}

export interface EvidenceGuardrail {
  hasSufficientEvidence: boolean;
  notes: string[];
  unsupportedClaims: string[];
}

export interface Finding {
  title: string;
  severity: Severity;
  whyItMatters: string;
  recommendation: string;
  evidence: SourceAnchor[];
}

export interface StageResult {
  stageId: AnalysisStageId;
  summary: string;
  findings: Finding[];
  followUpQuestions: string[];
  guardrail: EvidenceGuardrail;
  rawMarkdown: string;
  /** True when the stage fell back instead of producing real analysis. */
  failed?: boolean;
  durationMs?: number;
}

export type AnalysisEvent =
  | { type: "stage"; index: number; total: number; stage: StageResult }
  | { type: "report"; report: AnalysisReport }
  | { type: "error"; message: string };

export interface ResumeScorecard {
  overallScore: number;
  atsScore?: number;
  truthfulnessConfidence: number;
  interviewReadiness: number;
}

export interface AnalysisReport {
  createdAt: string;
  roleTarget: string;
  resumeText: string;
  jobDescription?: string;
  scorecard: ResumeScorecard;
  stageResults: StageResult[];
  topImprovements: string[];
  rewriteDraft: string;
  architectureNotes: {
    mvpScope: string[];
    uxPrinciples: string[];
    systemDesign: string[];
  };
}

export interface AnalyzeRequestPayload {
  resumeText: string;
  jobDescription?: string;
  targetRole?: string;
  /** Notes answered in a downloaded follow-up workbook. These are context, not resume evidence. */
  followUpContext?: string;
  /** Original report text from a follow-up workbook, supplied only for proofreading. */
  uploadedAnalysis?: string;
}

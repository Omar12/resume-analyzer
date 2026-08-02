import { StageDefinition } from "@/lib/types";

export const PIPELINE_STAGES: StageDefinition[] = [
  {
    id: "intake",
    label: "Normalize input",
    goal: "Extract text, confirm scope, and establish evidence boundaries."
  },
  {
    id: "executive-audit",
    label: "Executive audit",
    goal: "Judge first impression, clarity, and impact within a recruiter scan."
  },
  {
    id: "ats-match",
    label: "ATS match",
    goal: "Compare the resume against the job description when one is provided."
  },
  {
    id: "achievement-mining",
    label: "Achievement mining",
    goal: "Identify weak or vague accomplishments and surface targeted follow-up questions."
  },
  {
    id: "story-review",
    label: "Career story",
    goal: "Test whether the resume tells a coherent progression toward the target role."
  },
  {
    id: "proofread",
    label: "Proofread",
    goal: "Catch spelling, grammar, punctuation, and consistency issues in the submitted material."
  },
  {
    id: "rewrite",
    label: "Evidence-safe rewrite",
    goal: "Rewrite phrasing without inventing new achievements, metrics, or scope."
  }
];

# Resume Analysis Pipeline

Resume Analysis Pipeline is a Next.js MVP for structured resume review. It accepts a DOCX resume or pasted text plus an optional job description, then runs a staged AI workflow that critiques, questions, and rewrites while explicitly refusing to invent unsupported achievements.

## Architecture

- Frontend: Next.js App Router, React, TypeScript, Tailwind CSS
- Backend: Next.js route handlers for orchestration and exports
- LLM abstraction: `lib/llm.ts` wraps the provider call behind `generateJson`
- Prompt system: reusable stage templates in `lib/prompts/templates.ts`
- Shared model: typed report and stage structures in `lib/types/index.ts`

## Core UX

- Paste-first intake keeps the initial flow simple and fast
- Visible pipeline states make the review feel inspectable instead of opaque
- Stage outputs separate critique, follow-up questions, and guarded rewrites
- Export supports JSON for tooling and Markdown for sharing or editing

## Prompt pipeline

1. `intake`: lock the evidence boundary to the submitted text
2. `executive-audit`: evaluate first impression and scannability
3. `ats-match`: compare against the job description when present
4. `achievement-mining`: find vague claims and ask targeted questions
5. `story-review`: test narrative coherence and seniority signals
6. `rewrite`: improve phrasing without inventing content

## Guardrails

- Every prompt forbids fabricated metrics, scope, or responsibilities
- Recommendations require short evidence anchors from the resume text
- Weak evidence is surfaced as follow-up questions, not synthetic improvements
- Pipeline falls back to transparent error states instead of fake analysis

## MVP scope

- Resume text input
- Optional job description
- Typed multi-stage analysis
- Exportable Markdown and JSON reports
- Provider abstraction ready for additional model backends

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env.local
   ```

3. Add your OpenAI API key to `.env.local`

4. Start the app:

   ```bash
   npm run dev
   ```

## Notes

- This scaffold uses the OpenAI Responses API through the official `openai` package.
- DOCX resumes are parsed locally in the browser and loaded into the editable resume text field. PDF extraction is a logical next step.

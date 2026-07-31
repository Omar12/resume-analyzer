# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # dev server
npm run build      # production build
npm run typecheck  # tsc --noEmit — primary correctness gate
npm run lint       # next lint (no eslint dep or config installed yet — will prompt to set up)
```

No test framework installed. `npm run typecheck` is the only automated check that currently runs.

Setup: `cp .env.example .env.local`, then set `OPENAI_API_KEY`. `OPENAI_MODEL` defaults to `gpt-4.1-mini` in code ([lib/llm.ts:5](lib/llm.ts#L5)); `.env.example` suggests a different value. `AI_PROVIDER` must be `openai` or `generateJson` throws.

## Architecture

Next.js App Router MVP. Single request-response flow, no database, no persistence — a report lives only in client state until exported.

Flow: [components/resume-analyzer.tsx](components/resume-analyzer.tsx) (client, `"use client"`) POSTs to [app/api/analyze/route.ts](app/api/analyze/route.ts) → [lib/pipeline/run-analysis.ts](lib/pipeline/run-analysis.ts) → returns one `AnalysisReport`. Export is a second round-trip: client POSTs the whole report back to [app/api/export/route.ts](app/api/export/route.ts), which serializes to JSON or Markdown.

### The pipeline is sequential and per-stage-fault-tolerant

[lib/pipeline/stages.ts](lib/pipeline/stages.ts) defines six stages in order. `runResumeAnalysis` loops them one at a time (`intake` is computed locally, no LLM call; the other five each make one `generateJson` call). Each stage is wrapped in try/catch: any failure — network, bad JSON, zod rejection — is replaced by [lib/pipeline/fallback.ts](lib/pipeline/fallback.ts), a valid `StageResult` that states the analysis was unavailable. **The pipeline never throws mid-run and never fabricates output.** Adding a stage means touching four places: `AnalysisStageId` in [lib/types/index.ts](lib/types/index.ts), `PIPELINE_STAGES`, `STAGE_PROMPTS` in [lib/prompts/templates.ts](lib/prompts/templates.ts), and `stageLabels` in `fallback.ts` — the first two are type-checked, the last two are `Record` types so `typecheck` catches omissions.

### One JSON contract for every stage

All stages return the same shape. It is declared three times and the three must stay in sync:
- `stageResultSchema` ([lib/pipeline/schema.ts](lib/pipeline/schema.ts)) — runtime validation of model output
- `StageResult` ([lib/types/index.ts](lib/types/index.ts)) — the TS type shared by API and client
- `STAGE_JSON_SCHEMA_HINT` ([lib/prompts/templates.ts](lib/prompts/templates.ts)) — the shape pasted into every prompt

The model is asked for JSON via prompt text only; there is no structured-output/response_format enforcement, so `JSON.parse` + zod is the real guard.

### Anti-fabrication is the product

`baseGuardrails` is prepended to every stage prompt: no invented jobs, metrics, dates, or scope; cite short resume quotes as `evidence` anchors; where a rewrite would need missing data, preserve the original and add a `[needs metric]` bracket; weak evidence becomes a `followUpQuestion`, not a guess. Each stage also returns a `guardrail` object with `unsupportedClaims`. Preserve this when editing prompts.

### Scores are deterministic, not model-generated

[lib/pipeline/scoring.ts](lib/pipeline/scoring.ts) derives the scorecard from finding severities and unsupported-claim counts with fixed penalties and clamps. The LLM never emits a score. `atsScore` is `undefined` when the `ats-match` stage is absent.

## Conventions

- Imports use the `@/*` alias for everything (`@/lib/...`, `@/components/...`), not relative paths.
- Provider access goes through `generateJson` in [lib/llm.ts](lib/llm.ts) only — no direct `openai` imports elsewhere. It uses the Responses API (`responses.create`) and returns `output_text` as a raw string; parsing is the caller's job.
- DOCX parsing runs client-side via `mammoth` in the browser and fills the resume textarea; the server only ever sees text. PDF is not supported.
- Tailwind uses custom theme tokens (`pine`, `rust`, `shadow-panel`) defined in [tailwind.config.ts](tailwind.config.ts). `cn()` from [components/ui.tsx](components/ui.tsx) is the class merger.
- `typedRoutes` is on in [next.config.ts](next.config.ts).

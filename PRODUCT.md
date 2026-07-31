# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user: an individual job seeker reviewing their own resume, self-serve. Mid-to-senior candidate — the app's own default target role is "Senior Software Engineer" and the sample resume is a senior IC. High-stakes, low-frequency use: alone at a laptop, usually before applying to a specific role, often under time pressure. They arrive with a resume they have already written and doubts about it, not with a blank page.

No secondary audience is confirmed. Recruiters and career coaches were considered and not adopted.

## Product Purpose

Give a job seeker a structured, honest critique of their resume — and a rewrite they can actually defend in an interview. Success is the user leaving with (a) a specific list of what is weak and why, (b) follow-up questions that pull real accomplishments out of their memory, and (c) a rewrite containing nothing they cannot back up.

The failure the product exists to prevent: an AI tool inventing metrics, scope, or achievements that the candidate then has to answer for in an interview.

## Positioning

Two claims, in order:

1. **It refuses to fabricate.** Every recommendation cites a short direct quote from the submitted resume as an evidence anchor. Where a stronger rewrite would require information the resume does not contain, the tool preserves the original claim and flags the gap (`[needs metric]`) instead of filling it in. Weak evidence becomes a follow-up question, not a synthetic improvement. Unsupported claims are tracked explicitly per stage. Truthfulness is the product, not a disclaimer.
2. **The pipeline is inspectable.** Six named stages — normalize input, executive audit, ATS match, achievement mining, career story, evidence-safe rewrite — each produce their own summary, findings, and questions. The user reads critique separately from rewrite and can see which stage said what. Not one opaque spinner and one blob of output.

The second claim is how the first is proven. A competitor can say "we don't hallucinate"; the per-stage evidence anchors and unsupported-claim tracking are what make it checkable.

## Operating Context

- Single run, single page. User pastes resume text or uploads a DOCX (parsed in the browser, never uploaded as a file), optionally pastes a job description, optionally names a target role, runs the analysis, reads it, exports.
- The job description is optional and its absence is a real state: the ATS stage says matching is unavailable rather than pretending.
- Output leaves the tool as a JSON export (for tooling) or a Markdown export (for sharing or editing elsewhere). The user's next step happens in their own document, not here.
- Nothing carries over between runs — no history to return to, no account to log into.

## Capabilities and Constraints

Confirmed and built:

- Resume intake by paste or client-side DOCX parse; optional job description; optional target role.
- Six-stage analysis, run sequentially. Any stage that fails degrades to an explicit "analysis unavailable" state — the run never fails wholesale and never fabricates a substitute.
- Deterministic scorecard (overall, ATS, truthfulness confidence, interview readiness) computed from finding severities and unsupported-claim counts. The model never emits a score.
- Export to JSON and Markdown.
- Single LLM provider behind one adapter; provider is swappable by design.

Constraints:

- No accounts, no persistence, no payments, no database. A report exists only in browser state until exported. Losing the tab loses the report.
- No PDF support. PDF intake is a committed next step.
- Analysis is one long request with no streaming or partial results; the user waits through five sequential model calls.
- The scope tension is deliberate and both halves are real: the product stays a small single-run MVP for now, but is intended to become a real product later. Design and architecture should not foreclose accounts, saved reports, or history — and should not build them yet.

Undecided, do not invent:

- Whether resume text is promised as never-stored. Today nothing is persisted server-side as a matter of implementation, but no privacy commitment has been made to users and none should be stated in the UI until it is.
- Pricing, licensing, deployment target, and any competitive comparison.

## Brand Commitments

Name: Resume Analysis Pipeline. No logo, wordmark, or confirmed voice yet.

## Evidence on Hand

- A built, working implementation: the six-stage pipeline, guardrail prompts, deterministic scoring, and both export formats all exist in code.
- A sample resume ("Alex Morgan", senior software engineer) shipped as the default textarea contents — synthetic demo content, not a real user.

Absent, and not to be fabricated: users, testimonials, customers, case studies, benchmarks, accuracy claims, press, funding, team, or any "trusted by" proof. There is no usage data. Any number presented as measured would be invented.

## Product Principles

1. **Never assert what the resume does not support.** When evidence is thin, ask a question or flag a gap. This governs model output, UI copy, and any future marketing equally.
2. **Show the work.** The user should be able to see which stage produced a claim and what text it was based on. Legibility is the trust mechanism.
3. **Critique and rewrite stay separable.** The user inspects the reasoning before accepting the edit; never present a rewrite as a fait accompli.
4. **Degrade honestly.** A failure states that it failed. No stale results, no filler, no plausible-looking substitute analysis.
5. **Stay small on purpose, but don't wall off growth.** Ship the single-run tool; leave room for accounts, history, and PDF without pre-building them.

"use client";

import mammoth from "mammoth";
import {
  ChangeEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { findQuoteRange } from "@/lib/evidence";
import { SCORE_MAX } from "@/lib/pipeline/scoring";
import { PIPELINE_STAGES } from "@/lib/pipeline/stages";
import {
  AnalysisEvent,
  AnalysisReport,
  AnalysisStageId,
  StageResult
} from "@/lib/types";
import { Card, Pill, cn } from "@/components/ui";

type ExportFormat = "json" | "markdown";
type RunState = "idle" | "running" | "done" | "error";

const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

const resumeExamples = [
  {
    title: "Senior software engineer",
    role: "Senior Software Engineer",
    text: `Alex Morgan
Senior Software Engineer | San Francisco, CA | alex.morgan@email.com | linkedin.com/in/alexmorgan | github.com/alexmorgan

SUMMARY
Product-minded software engineer with 8 years of experience building reliable B2B SaaS products. Leads end-to-end delivery across React, TypeScript, Node.js, and AWS; known for improving product performance, engineering quality, and team velocity.

EXPERIENCE
Senior Software Engineer, Northstar Analytics | 2021–Present
- Led a 6-person squad that delivered self-serve analytics workflows used by 1,200+ enterprise customers, increasing weekly active users 34% in 12 months.
- Re-architected a React and TypeScript reporting experience, reducing median page load time from 4.2s to 1.6s and improving task completion by 18%.
- Designed Node.js APIs and PostgreSQL data models for a usage-insights product that contributed $2.4M in annual recurring revenue in its first year.
- Introduced automated end-to-end testing and release checks, reducing production incidents 41% and cutting average rollback time from 52 to 19 minutes.
- Mentored 4 engineers through technical design reviews and pairing; 2 advanced to senior-level roles.

Software Engineer, Harbor Cloud | 2018–2021
- Built API integrations and internal developer tooling used by 80+ engineers, reducing environment setup time from 2 days to under 3 hours.
- Migrated 14 services to AWS ECS with CI/CD pipelines, improving deployment frequency from weekly to daily while maintaining 99.95% availability.
- Partnered with product and design to launch account administration features that reduced support tickets 27%.

EDUCATION
B.S., Computer Science, University of Washington

SKILLS
TypeScript, JavaScript, React, Next.js, Node.js, PostgreSQL, AWS, Docker, CI/CD, Playwright, REST APIs, system design`
  },
  {
    title: "Product marketing manager",
    role: "Product Marketing Manager",
    text: `Jordan Lee
Product Marketing Manager | New York, NY | jordan.lee@email.com | linkedin.com/in/jordanlee

SUMMARY
B2B SaaS product marketer with 7 years of experience translating customer insight into positioning, launches, and sales enablement. Combines market research, crisp messaging, and cross-functional execution to grow adoption and revenue.

EXPERIENCE
Senior Product Marketing Manager, Atlas Security | 2022–Present
- Owned positioning and go-to-market strategy for a cloud security platform launch that generated $3.1M in qualified pipeline within two quarters.
- Conducted 38 customer and prospect interviews to refresh messaging; the new homepage and campaign narrative increased demo conversion 26%.
- Built sales enablement for a 65-person GTM team, improving win rate in the enterprise segment from 21% to 29%.
- Partnered with product, demand generation, and customer success to launch 4 major features, each meeting or exceeding 90-day adoption targets.
- Established a competitive intelligence program with monthly battlecards and quarterly briefings used in 85% of enterprise opportunities.

Product Marketing Manager, Luma Workflow | 2019–2022
- Led segmentation, personas, and packaging for a workflow automation suite, contributing to a 22% increase in annual contract value.
- Created lifecycle campaigns that increased trial-to-paid conversion 17% and reduced sales-cycle length by 11 days.
- Managed webinars, customer stories, and analyst materials that produced 1,800 marketing-qualified leads in 2021.

EDUCATION
B.A., Economics, Boston University

SKILLS
Go-to-market strategy, positioning and messaging, customer research, competitive intelligence, sales enablement, product launches, lifecycle marketing, demand generation, Salesforce, HubSpot`
  }
] as const;

const sampleResume = resumeExamples[0].text;

const runStateLabels: Record<RunState, string> = {
  idle: "not started",
  running: "reading",
  done: "complete",
  error: "stopped"
};

const stageLabels = Object.fromEntries(
  PIPELINE_STAGES.map((stage) => [stage.id, stage.label])
) as Record<AnalysisStageId, string>;

function formatDuration(ms: number | undefined) {
  if (ms === undefined) {
    return null;
  }
  if (ms < 950) {
    return `${Math.max(ms, 1)}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function ResumeAnalyzer() {
  const [resumeText, setResumeText] = useState<string>(sampleResume);
  const [jobDescription, setJobDescription] = useState("");
  const [targetRole, setTargetRole] = useState("Senior Software Engineer");
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [liveStages, setLiveStages] = useState<StageResult[]>([]);
  const [runState, setRunState] = useState<RunState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState<string | null>(null);
  const [tracedQuote, setTracedQuote] = useState<{
    quote: string;
    found: boolean;
    exact: boolean;
  } | null>(null);

  const resumeRef = useRef<HTMLTextAreaElement>(null);
  const resultsRef = useRef<HTMLElement>(null);

  const selectedExample = resumeExamples.find((example) => example.text === resumeText);
  const isSample = Boolean(selectedExample);
  const isRunning = runState === "running";
  const tooShort = resumeText.trim().length < 80;
  const runningIndex = isRunning ? liveStages.length : -1;
  const runningStage = runningIndex >= 0 ? PIPELINE_STAGES[runningIndex] : null;

  const completedStages = useMemo(
    () => liveStages.filter((stage) => !stage.failed).length,
    [liveStages]
  );

  useEffect(() => {
    setTracedQuote(null);
  }, [resumeText]);

  // The run is long enough that the user has scrolled or looked away. Bring
  // them to the payoff rather than leaving it below the fold.
  useEffect(() => {
    if (runState === "done" && report) {
      resultsRef.current?.scrollIntoView({
        block: "start",
        behavior: prefersReducedMotion() ? "auto" : "smooth"
      });
    }
  }, [runState, report]);

  async function handleAnalyze() {
    setRunState("running");
    setError(null);
    setReport(null);
    setLiveStages([]);
    setTracedQuote(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText, jobDescription, targetRole })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "The analysis could not be started.");
      }

      if (!response.body) {
        throw new Error("This browser could not read the analysis stream.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamError: string | null = null;

      const consume = (line: string) => {
        if (!line.trim()) {
          return;
        }

        const event = JSON.parse(line) as AnalysisEvent;

        if (event.type === "stage") {
          setLiveStages((current) => [...current, event.stage]);
        } else if (event.type === "report") {
          setReport(event.report);
        } else {
          streamError = event.message;
        }
      };

      for (;;) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach(consume);
      }

      consume(buffer);

      if (streamError) {
        throw new Error(streamError);
      }

      setRunState("done");
    } catch (analysisError) {
      setError(
        analysisError instanceof Error
          ? analysisError.message
          : "The analysis stopped before it finished."
      );
      setRunState("error");
    }
  }

  async function handleDocumentChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".docx")) {
      setError("Choose a Microsoft Word (.docx) file.");
      return;
    }

    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      setError("The document must be 10 MB or smaller.");
      return;
    }

    setError(null);
    setDocumentName(null);

    try {
      const { value } = await mammoth.extractRawText({
        arrayBuffer: await file.arrayBuffer()
      });
      const extractedText = value.trim();

      if (!extractedText) {
        throw new Error("No readable text was found in that document.");
      }

      setResumeText(extractedText);
      setDocumentName(file.name);
    } catch (documentError) {
      setError(
        documentError instanceof Error
          ? `Could not read this DOCX file: ${documentError.message}`
          : "Could not read this DOCX file."
      );
    }
  }

  async function handleExport(format: ExportFormat) {
    if (!report) {
      return;
    }

    setExportError(null);

    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report, format })
      });

      if (!response.ok) {
        throw new Error("The export could not be generated.");
      }

      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = format === "json" ? "resume-analysis.json" : "resume-analysis.md";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      // Revoking in the same tick cancels the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (exportError) {
      setExportError(
        exportError instanceof Error
          ? exportError.message
          : "The export could not be generated."
      );
    }
  }

  /**
   * Trace a cited quote back to the words it came from. This is the whole
   * promise of the tool made physical: the report never gets to assert
   * something the resume does not say without the user being able to check.
   */
  const traceEvidence = useCallback(
    (quote: string) => {
      const textarea = resumeRef.current;
      const range = findQuoteRange(resumeText, quote);

      if (!range || !textarea) {
        setTracedQuote({ quote, found: false, exact: false });
        return;
      }

      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(range.start, range.end);

      // ponytail: line-height estimate, not a measured caret box. Wrapped lines
      // land a little high; swap for a mirrored-div measurement if that bites.
      const lineHeight =
        Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 24;
      const linesBefore = resumeText.slice(0, range.start).split("\n").length - 1;

      textarea.scrollTo({
        top: Math.max(0, linesBefore * lineHeight - textarea.clientHeight / 2),
        behavior: prefersReducedMotion() ? "auto" : "smooth"
      });

      textarea.scrollIntoView({
        block: "center",
        behavior: prefersReducedMotion() ? "auto" : "smooth"
      });

      setTracedQuote({ quote, found: true, exact: range.exact });
    },
    [resumeText]
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-14 px-4 py-10 md:gap-20 md:px-8 md:py-14">
      {/*
        Masthead sits on the page rather than in a card, so the tool below it
        reads as the primary element instead of the second of three panels.
      */}
      <header className="flex flex-col gap-5">
        <h1 className="max-w-[19ch] font-display text-[2.75rem] leading-[1.05] tracking-[-0.02em] md:text-6xl">
          Structured resume analysis with visible stages, grounded evidence, and safe rewrites.
        </h1>
        <p className="max-w-[62ch] text-base leading-7 text-black/70">
          Upload a DOCX resume or paste text, optionally add a job description, and run a multi-step AI review that critiques, questions, and rewrites without inventing achievements.
        </p>
        <dl className="mt-1 flex flex-wrap items-baseline gap-x-8 gap-y-3 text-sm">
          <Fact label="Architecture" value="Next.js + TS" />
          <Fact label="Pipeline stages" value={`${PIPELINE_STAGES.length}`} />
          <Fact label="Guardrail mode" value="Strict evidence" />
        </dl>
      </header>

      {/*
        Input leads and the pipeline supports; the rail is sticky because the
        run takes over a minute and progress must survive the user scrolling.
      */}
      <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr),minmax(0,1fr)] lg:gap-8">
        <Card className="p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl">Input</h2>
              <p className="mt-1.5 max-w-[52ch] text-sm leading-6 text-black/65">
                Resume text is the source of truth. The app never adds unsupported facts.
              </p>
            </div>
            <Pill tone={resumeText.length > 80 ? "good" : "warn"}>
              {resumeText.length} chars
            </Pill>
          </div>

          <div className="mt-8 flex flex-col gap-6">
            <Field label="Target role" htmlFor="target-role">
              <input
                id="target-role"
                value={targetRole}
                onChange={(event) => setTargetRole(event.target.value)}
                className="w-full rounded-2xl border border-black/10 bg-paper px-4 py-3 outline-none transition focus:border-rust/40 focus:ring-2 focus:ring-rust/45"
                placeholder="Senior Software Engineer"
              />
            </Field>

            <Field
              label="Resume document (optional)"
              htmlFor="resume-document"
              hint={`Microsoft Word (.docx), up to 10 MB. Text is extracted in your browser and replaces the field below.${
                documentName ? ` Loaded: ${documentName}` : ""
              }`}
            >
              <input
                id="resume-document"
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleDocumentChange}
                className="block w-full cursor-pointer rounded-2xl border border-black/10 bg-paper px-4 py-3 text-sm file:mr-4 file:rounded-full file:border-0 file:bg-ink file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust/60"
              />
            </Field>

            <div>
              <p className="text-sm font-semibold">High-scoring examples</p>
              <p className="mt-1 text-sm leading-6 text-black/65">
                Load a complete, metrics-backed example to see what a strong analysis looks like.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {resumeExamples.map((example) => {
                  const isSelected = selectedExample?.title === example.title;

                  return (
                    <button
                      key={example.title}
                      type="button"
                      onClick={() => {
                        setResumeText(example.text);
                        setTargetRole(example.role);
                        setDocumentName(null);
                        setTracedQuote(null);
                      }}
                      aria-pressed={isSelected}
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-rust/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
                        isSelected
                          ? "border-ink bg-ink text-white"
                          : "border-black/10 bg-white/70 hover:border-black/25"
                      )}
                    >
                      {example.title}
                    </button>
                  );
                })}
              </div>
            </div>

            <Field
              label="Resume text"
              htmlFor="resume-text"
              action={
                isSample ? (
                  <span className="text-xs text-black/60">
                    Using the {selectedExample?.title} example.{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setResumeText("");
                        resumeRef.current?.focus();
                      }}
                      className="rounded-sm font-semibold text-rust underline underline-offset-2 outline-none transition hover:text-ink focus-visible:ring-2 focus-visible:ring-rust/40"
                    >
                      Clear it and paste your own
                    </button>
                  </span>
                ) : null
              }
            >
              <textarea
                id="resume-text"
                ref={resumeRef}
                value={resumeText}
                onChange={(event) => setResumeText(event.target.value)}
                className="min-h-[22rem] w-full rounded-3xl border border-black/10 bg-paper px-4 py-4 leading-6 outline-none transition focus:border-rust/40 focus:ring-2 focus:ring-rust/45"
                placeholder="Paste the resume text here..."
              />
              {tracedQuote ? (
                <p
                  className={cn(
                    "stage-settle mt-3 rounded-2xl px-4 py-3 text-sm leading-6",
                    tracedQuote.found ? "bg-pine/5 text-pine" : "bg-rust/8 text-rust"
                  )}
                  role="status"
                >
                  {tracedQuote.found
                    ? tracedQuote.exact
                      ? "Selected above — that quote is in your resume word for word."
                      : "Selected the closest match above. The quote was shortened, so check the wording."
                    : "That quote is not in your resume text. Treat the finding it supports as unverified."}
                </p>
              ) : null}
            </Field>

            <Field label="Job description (optional)" htmlFor="job-description">
              <textarea
                id="job-description"
                value={jobDescription}
                onChange={(event) => setJobDescription(event.target.value)}
                className="min-h-[10rem] w-full rounded-3xl border border-black/10 bg-paper px-4 py-4 leading-6 outline-none transition focus:border-rust/40 focus:ring-2 focus:ring-rust/45"
                placeholder="Paste the target role description if you want ATS matching..."
              />
            </Field>
          </div>

          <div className="mt-8 border-t border-black/10 pt-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <button
                onClick={handleAnalyze}
                className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white outline-none transition hover:bg-black focus-visible:ring-2 focus-visible:ring-rust/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:cursor-not-allowed disabled:opacity-40"
                disabled={tooShort || isRunning}
              >
                {isRunning
                  ? `Reading — ${runningStage?.label ?? "finishing up"}`
                  : "Run analysis"}
              </button>
              {tooShort ? (
                <p className="text-sm leading-6 text-black/65">
                  Paste at least 80 characters of resume text to run the analysis.
                </p>
              ) : null}
            </div>

            {error ? (
              <p
                role="alert"
                className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-700"
              >
                {error}
              </p>
            ) : null}
          </div>
        </Card>

        <Card className="p-6 lg:sticky lg:top-8 lg:max-h-[calc(100vh-4rem)] lg:overflow-auto">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl">Pipeline progress</h2>
              <p className="mt-1.5 max-w-[42ch] text-sm leading-6 text-black/65">
                Every stage reports as it lands, so you can see the review happen
                instead of waiting behind one spinner.
              </p>
            </div>
            <Pill
              tone={
                runState === "done"
                  ? "good"
                  : runState === "error"
                    ? "bad"
                    : isRunning
                      ? "warn"
                      : "default"
              }
            >
              {isRunning
                ? `${liveStages.length} of ${PIPELINE_STAGES.length}`
                : runStateLabels[runState]}
            </Pill>
          </div>

          <p className="sr-only" role="status" aria-live="polite">
            {isRunning && runningStage
              ? `Stage ${liveStages.length + 1} of ${PIPELINE_STAGES.length}: ${runningStage.label} in progress.`
              : runState === "done"
                ? `Analysis complete. ${completedStages} of ${PIPELINE_STAGES.length} stages returned results.`
                : runState === "error"
                  ? "The analysis stopped before it finished."
                  : ""}
          </p>

          <ol className="mt-6 flex flex-col gap-2">
            {PIPELINE_STAGES.map((stage, index) => {
              const result = liveStages[index];
              const isStageRunning = index === runningIndex;
              const duration = formatDuration(result?.durationMs);

              return (
                <li
                  key={stage.id}
                  className={cn(
                    "rounded-2xl border px-4 py-3 transition duration-500",
                    result?.failed
                      ? "border-rust/25 bg-rust/5"
                      : result
                        ? "border-pine/20 bg-pine/5"
                        : isStageRunning
                          ? "border-pine/25 bg-white"
                          : "border-black/10 bg-white/60"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">{stage.label}</p>
                    <div className="flex shrink-0 items-center gap-2">
                      {duration && !result?.failed ? (
                        <span className="text-xs tabular-nums text-black/60">
                          {duration}
                        </span>
                      ) : null}
                      <Pill
                        tone={
                          result?.failed
                            ? "bad"
                            : result
                              ? "good"
                              : isStageRunning
                                ? "warn"
                                : "default"
                        }
                      >
                        {result?.failed
                          ? "unavailable"
                          : result
                            ? "complete"
                            : isStageRunning
                              ? "reading"
                              : "queued"}
                      </Pill>
                    </div>
                  </div>

                  {/* The goal orients before the run; the summary replaces it after. */}
                  {result ? null : (
                    <p className="mt-1 text-sm leading-6 text-black/65">{stage.goal}</p>
                  )}

                  {isStageRunning ? (
                    <div className="reading-sweep relative mt-3 h-px overflow-hidden rounded-full bg-pine/15" />
                  ) : null}

                  {result && isRunning ? (
                    <p className="stage-settle mt-2 text-sm leading-6 text-black/70">
                      {result.summary}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </Card>
      </section>

      {report ? (
        <section ref={resultsRef} className="flex scroll-mt-8 flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <h2 className="font-display text-4xl tracking-[-0.02em]">Results</h2>
              {report.roleTarget ? (
                <Pill tone="good">Role: {report.roleTarget}</Pill>
              ) : null}
            </div>
            {/* Export sits with the finished report, not back up in the form. */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => handleExport("markdown")}
                className="rounded-full border border-black/10 bg-white/70 px-5 py-3 text-sm font-semibold outline-none transition hover:border-black/25 focus-visible:ring-2 focus-visible:ring-rust/50"
              >
                Export Markdown
              </button>
              <div className="group relative">
                <button
                  onClick={() => handleExport("json")}
                  aria-describedby="export-json-help"
                  className="rounded-full border border-black/10 bg-white/70 px-5 py-3 text-sm font-semibold outline-none transition hover:border-black/25 focus-visible:ring-2 focus-visible:ring-rust/50"
                >
                  Export JSON
                </button>
                <span
                  id="export-json-help"
                  role="tooltip"
                  className="pointer-events-none absolute right-0 top-[calc(100%+0.5rem)] z-10 w-64 rounded-xl bg-ink px-3 py-2 text-xs font-normal leading-5 text-white opacity-0 shadow-panel transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  Save the structured report for your records, share it with a developer, or import it into another tool.
                </span>
              </div>
            </div>
          </div>

          {exportError ? (
            <p
              role="alert"
              className="rounded-2xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-700"
            >
              {exportError}
            </p>
          ) : null}

          <Card className="p-6 md:p-8">
            <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Overall score"
                value={`${report.scorecard.overallScore}`}
                max={SCORE_MAX.overallScore}
                count
              />
              <Metric
                label="ATS score"
                value={
                  report.scorecard.atsScore === undefined
                    ? "Not scored"
                    : `${report.scorecard.atsScore}`
                }
                max={SCORE_MAX.atsScore}
                count={report.scorecard.atsScore !== undefined}
              />
              <Metric
                label="Truthfulness confidence"
                value={`${report.scorecard.truthfulnessConfidence}`}
                max={SCORE_MAX.truthfulnessConfidence}
                count
              />
              <Metric
                label="Interview readiness"
                value={`${report.scorecard.interviewReadiness}`}
                max={SCORE_MAX.interviewReadiness}
                count
              />
            </div>
          </Card>

          {report.topImprovements.length ? (
            <Card className="p-6 md:p-8">
              <h3 className="font-display text-2xl">Top improvements</h3>
              <ol className="mt-5 flex flex-col gap-2">
                {report.topImprovements.map((item, index) => (
                  <li
                    key={`${item}-${index}`}
                    className="flex gap-4 rounded-2xl bg-paper px-4 py-3 text-sm leading-6"
                  >
                    <span className="shrink-0 tabular-nums text-black/45">
                      {index + 1}
                    </span>
                    <span className="max-w-[68ch]">{item}</span>
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr),minmax(0,0.85fr)] xl:gap-8">
            <div className="flex flex-col gap-6">
              {report.stageResults.map((stage) => (
                <Card
                  key={stage.stageId}
                  className={cn(
                    "p-6 md:p-8",
                    stage.failed && "border-rust/25 bg-rust/[0.04]"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <h3 className="font-display text-2xl">
                      {stageLabels[stage.stageId] ?? stage.stageId}
                    </h3>
                    <Pill
                      tone={
                        stage.failed
                          ? "bad"
                          : stage.guardrail.hasSufficientEvidence
                            ? "good"
                            : "warn"
                      }
                    >
                      {stage.failed
                        ? "stage unavailable"
                        : stage.guardrail.hasSufficientEvidence
                          ? "evidence sufficient"
                          : "evidence weak"}
                    </Pill>
                  </div>
                  <p className="mt-3 max-w-[70ch] text-sm leading-6 text-black/75">
                    {stage.summary}
                  </p>

                  {/* Hairlines, not nested cards: findings are rows of one list. */}
                  {stage.findings.length ? (
                    <div className="mt-6 flex flex-col divide-y divide-black/10 border-t border-black/10">
                      {stage.findings.map((finding, index) => (
                        <article
                          key={`${finding.title}-${index}`}
                          className="py-5 first:pt-6 last:pb-0"
                        >
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                            <Pill
                              tone={
                                finding.severity === "high"
                                  ? "bad"
                                  : finding.severity === "medium"
                                    ? "warn"
                                    : "default"
                              }
                            >
                              {finding.severity}
                            </Pill>
                            <h4 className="font-semibold">{finding.title}</h4>
                          </div>
                          <p className="mt-3 max-w-[70ch] text-sm leading-6 text-black/75">
                            {finding.whyItMatters}
                          </p>
                          <p className="mt-2 max-w-[70ch] text-sm font-medium leading-6 text-black">
                            {finding.recommendation}
                          </p>
                          {finding.evidence.length ? (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {finding.evidence.map((evidence, evidenceIndex) => (
                                <button
                                  key={`${evidence.quote}-${evidenceIndex}`}
                                  type="button"
                                  onClick={() => traceEvidence(evidence.quote)}
                                  title="Select this text in your resume"
                                  className="inline-flex min-h-[2.25rem] max-w-full items-center rounded-full bg-black/5 px-3.5 py-1.5 text-left text-xs leading-5 text-black/70 outline-none transition hover:bg-rust/12 hover:text-rust focus-visible:ring-2 focus-visible:ring-rust/40"
                                >
                                  <span className="line-clamp-2">
                                    &ldquo;{evidence.quote}&rdquo;
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  ) : null}

                  {stage.guardrail.unsupportedClaims.length ? (
                    <div className="mt-6 rounded-2xl border border-rust/20 bg-rust/5 p-4">
                      <h4 className="text-sm font-semibold text-rust">
                        Claims this stage could not support
                      </h4>
                      <ul className="mt-2 flex max-w-[68ch] flex-col gap-2 text-sm leading-6 text-black/75">
                        {stage.guardrail.unsupportedClaims.map((claim, index) => (
                          <li key={`${claim}-${index}`}>{claim}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {stage.followUpQuestions.length ? (
                    <div className="mt-4 rounded-2xl bg-pine/5 p-4">
                      <h4 className="text-sm font-semibold text-pine">
                        Answer these and the rewrite gets stronger
                      </h4>
                      <ul className="mt-2 flex max-w-[68ch] flex-col gap-2 text-sm leading-6 text-black/75">
                        {stage.followUpQuestions.map((question, index) => (
                          <li key={`${question}-${index}`}>{question}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </Card>
              ))}
            </div>

            <Card className="p-6 md:p-8 xl:sticky xl:top-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-display text-2xl">Rewrite draft</h3>
                <Pill tone="warn">Guarded</Pill>
              </div>
              <p className="mt-3 text-sm leading-6 text-black/70">
                This rewrite is allowed to improve language and structure, but not to add unsupported facts. Gaps should be marked inline.
              </p>
              <pre className="mt-6 max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-2xl bg-black p-5 text-sm leading-6 text-white">
                {report.rewriteDraft || "No rewrite was produced."}
              </pre>
            </Card>
          </div>
        </section>
      ) : null}

      {/* Build notes rank last: they describe the tool, not the user's resume. */}
      <section className="mt-2 flex flex-col gap-6 border-t border-black/10 pt-10">
        <h2 className="font-display text-2xl">About this build</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="bg-black p-6 text-white md:p-8">
            <h3 className="font-display text-xl">MVP scope</h3>
            <ul className="mt-4 flex max-w-[62ch] flex-col gap-3 text-sm leading-6 text-white/75">
              <li>DOCX upload extracts text locally, with paste available for quick edits.</li>
              <li>Each stage exposes concrete findings instead of opaque model output.</li>
              <li>Weak evidence triggers follow-up questions instead of speculative edits.</li>
              <li>Exports support JSON for downstream tooling and Markdown for sharing.</li>
            </ul>
          </Card>

          <Card className="bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(32,65,58,0.06))] p-6 md:p-8">
            <h3 className="font-display text-xl">Architecture</h3>
            {report ? (
              <div className="mt-4 flex flex-col gap-5 text-sm text-black/75">
                <SectionList title="System design" items={report.architectureNotes.systemDesign} />
                <SectionList title="UX principles" items={report.architectureNotes.uxPrinciples} />
                <SectionList title="MVP scope" items={report.architectureNotes.mvpScope} />
              </div>
            ) : (
              <p className="mt-4 max-w-[62ch] text-sm leading-6 text-black/70">
                The app uses a server-side orchestrator, typed prompt templates, and an isolated model adapter so the pipeline logic stays reusable if you swap providers later.
              </p>
            )}
          </Card>
        </div>
      </section>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-xs uppercase tracking-[0.18em] text-black/60">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  action,
  children
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <label className="text-sm font-medium text-black/80" htmlFor={htmlFor}>
          {label}
        </label>
        {action}
      </div>
      {children}
      {hint ? (
        <p className="mt-2 max-w-[62ch] text-xs leading-5 text-black/60">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Counts up once on mount. The scorecard is the payoff of a long wait, so the
 * number resolves rather than appearing; it never invents a value it did not
 * receive, and reduced-motion users get the final figure immediately.
 */
function useCountUp(target: number | null) {
  const [display, setDisplay] = useState(target ?? 0);

  useEffect(() => {
    if (target === null || prefersReducedMotion()) {
      return;
    }

    const duration = 700;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      setDisplay(Math.round(target * eased));

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    setDisplay(0);
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [target]);

  return display;
}

function Metric({
  label,
  value,
  max,
  count = false
}: {
  label: string;
  value: string;
  max: number;
  count?: boolean;
}) {
  const numeric = count ? Number(value) : Number.NaN;
  const animated = useCountUp(Number.isFinite(numeric) ? numeric : null);
  const scored = Number.isFinite(numeric);

  return (
    <div>
      <p className="text-xs uppercase leading-5 tracking-[0.18em] text-black/60">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 font-display tabular-nums leading-none",
          scored ? "text-5xl" : "text-2xl text-black/60"
        )}
      >
        {scored ? animated : value}
        {/* The ceiling is a clamp, not 100 — state it rather than imply it. */}
        {scored ? (
          <span className="ml-1.5 align-baseline text-xl text-black/45">
            /{max}
          </span>
        ) : null}
      </p>
    </div>
  );
}

function SectionList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="text-xs uppercase tracking-[0.18em] text-black/60">{title}</h4>
      <ul className="mt-2 flex max-w-[62ch] flex-col gap-2 leading-6">
        {items.map((item) => (
          <li key={item} className="rounded-2xl bg-white/70 px-4 py-3">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import mammoth from "mammoth";
import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { findQuoteRange } from "@/lib/evidence";
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

const sampleResume = `Alex Morgan
Senior Software Engineer

Experience
Lead engineer for a B2B analytics platform used by enterprise customers. Built React and TypeScript frontends, collaborated with product and design, and improved release quality through test automation.
Managed roadmap delivery across a small cross-functional squad and mentored newer engineers.

Previous roles
Worked on internal developer tooling, API integrations, and cloud deployments across multiple product teams.

Skills
TypeScript, React, Next.js, Node.js, PostgreSQL, AWS, CI/CD, testing`;

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
  const [resumeText, setResumeText] = useState(sampleResume);
  const [jobDescription, setJobDescription] = useState("");
  const [targetRole, setTargetRole] = useState("Senior Software Engineer");
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [liveStages, setLiveStages] = useState<StageResult[]>([]);
  const [runState, setRunState] = useState<RunState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState<string | null>(null);
  const [tracedQuote, setTracedQuote] = useState<{
    quote: string;
    found: boolean;
    exact: boolean;
  } | null>(null);

  const resumeRef = useRef<HTMLTextAreaElement>(null);
  const isSample = resumeText === sampleResume;
  const runningIndex = runState === "running" ? liveStages.length : -1;
  const runningStage = runningIndex >= 0 ? PIPELINE_STAGES[runningIndex] : null;

  const completedStages = useMemo(
    () => liveStages.filter((stage) => !stage.failed).length,
    [liveStages]
  );

  useEffect(() => {
    setTracedQuote(null);
  }, [resumeText]);

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

    const response = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report, format })
    });

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = format === "json" ? "resume-analysis.json" : "resume-analysis.md";
    anchor.click();
    URL.revokeObjectURL(url);
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
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <section className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
        <Card className="overflow-hidden bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(220,201,172,0.44))]">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <Pill tone="good">MVP</Pill>
            <Pill>Evidence-aware</Pill>
            <Pill>Reusable prompts</Pill>
          </div>
          <h1 className="max-w-2xl font-display text-4xl leading-tight md:text-5xl">
            Structured resume analysis with visible stages, grounded evidence, and safe rewrites.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-black/70 md:text-base">
            Upload a DOCX resume or paste text, optionally add a job description, and run a multi-step AI review that critiques, questions, and rewrites without inventing achievements.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <Metric label="Architecture" value="Next.js + TS" />
            <Metric label="Pipeline stages" value={`${PIPELINE_STAGES.length}`} />
            <Metric label="Guardrail mode" value="Strict evidence" />
          </div>
        </Card>

        <Card className="bg-black text-white">
          <h2 className="font-display text-2xl">MVP scope</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-white/78">
            <li>DOCX upload extracts text locally, with paste available for quick edits.</li>
            <li>Each stage exposes concrete findings instead of opaque model output.</li>
            <li>Weak evidence triggers follow-up questions instead of speculative edits.</li>
            <li>Exports support JSON for downstream tooling and Markdown for sharing.</li>
          </ul>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.95fr,1.05fr]">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl">Input</h2>
              <p className="mt-1 text-sm text-black/65">
                Resume text is the source of truth. The app never adds unsupported facts.
              </p>
            </div>
            <Pill tone={resumeText.length > 80 ? "good" : "warn"}>
              {resumeText.length} chars
            </Pill>
          </div>

          <label
            className="mt-6 block text-sm font-medium text-black/80"
            htmlFor="target-role"
          >
            Target role
          </label>
          <input
            id="target-role"
            value={targetRole}
            onChange={(event) => setTargetRole(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-black/10 bg-paper px-4 py-3 outline-none ring-rust/20 transition focus:ring"
            placeholder="Senior Software Engineer"
          />

          <label
            className="mt-5 block text-sm font-medium text-black/80"
            htmlFor="resume-document"
          >
            Resume document (optional)
          </label>
          <input
            id="resume-document"
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleDocumentChange}
            className="mt-2 block w-full cursor-pointer rounded-2xl border border-black/10 bg-paper px-4 py-3 text-sm file:mr-4 file:rounded-full file:border-0 file:bg-ink file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-black"
          />
          <p className="mt-2 text-xs text-black/60">
            Microsoft Word (.docx), up to 10 MB. Text is extracted in your browser and replaces the field below.
            {documentName ? ` Loaded: ${documentName}` : ""}
          </p>

          <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
            <label className="text-sm font-medium text-black/80" htmlFor="resume-text">
              Resume text
            </label>
            {isSample ? (
              <p className="text-xs text-black/60">
                This is a sample resume.{" "}
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
              </p>
            ) : null}
          </div>
          <textarea
            id="resume-text"
            ref={resumeRef}
            value={resumeText}
            onChange={(event) => setResumeText(event.target.value)}
            className="mt-2 min-h-[320px] w-full rounded-3xl border border-black/10 bg-paper px-4 py-4 leading-6 outline-none ring-rust/20 transition focus:ring"
            placeholder="Paste the resume text here..."
          />

          {tracedQuote ? (
            <p
              className={cn(
                "stage-settle mt-3 rounded-2xl px-4 py-3 text-sm leading-6",
                tracedQuote.found
                  ? "bg-pine/5 text-pine"
                  : "bg-rust/8 text-rust"
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

          <label
            className="mt-5 block text-sm font-medium text-black/80"
            htmlFor="job-description"
          >
            Job description (optional)
          </label>
          <textarea
            id="job-description"
            value={jobDescription}
            onChange={(event) => setJobDescription(event.target.value)}
            className="mt-2 min-h-[180px] w-full rounded-3xl border border-black/10 bg-paper px-4 py-4 outline-none ring-rust/20 transition focus:ring"
            placeholder="Paste the target role description if you want ATS matching..."
          />

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={handleAnalyze}
              className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
              disabled={resumeText.trim().length < 80 || runState === "running"}
            >
              {runState === "running"
                ? `Reading — ${runningStage?.label ?? "finishing up"}`
                : "Run analysis"}
            </button>
            <button
              onClick={() => handleExport("markdown")}
              className="rounded-full border border-black/10 px-5 py-3 text-sm font-semibold transition hover:border-black/25 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!report}
            >
              Export Markdown
            </button>
            <button
              onClick={() => handleExport("json")}
              className="rounded-full border border-black/10 px-5 py-3 text-sm font-semibold transition hover:border-black/25 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!report}
            >
              Export JSON
            </button>
          </div>

          {error ? (
            <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </Card>

        <div className="grid gap-6">
          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl">Pipeline progress</h2>
                <p className="mt-1 text-sm text-black/65">
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
                      : runState === "running"
                        ? "warn"
                        : "default"
                }
              >
                {runState === "running"
                  ? `${liveStages.length} of ${PIPELINE_STAGES.length}`
                  : runState}
              </Pill>
            </div>

            <p className="sr-only" role="status" aria-live="polite">
              {runState === "running" && runningStage
                ? `Stage ${liveStages.length + 1} of ${PIPELINE_STAGES.length}: ${runningStage.label} in progress.`
                : runState === "done"
                  ? `Analysis complete. ${completedStages} of ${PIPELINE_STAGES.length} stages returned results.`
                  : ""}
            </p>

            <div className="mt-6 space-y-3">
              {PIPELINE_STAGES.map((stage, index) => {
                const result = liveStages[index];
                const isRunning = index === runningIndex;
                const duration = formatDuration(result?.durationMs);

                return (
                  <div
                    key={stage.id}
                    className={cn(
                      "rounded-3xl border px-4 py-4 transition duration-500",
                      result?.failed
                        ? "border-rust/25 bg-rust/5"
                        : result
                          ? "border-pine/20 bg-pine/5"
                          : isRunning
                            ? "border-pine/25 bg-white"
                            : "border-black/10 bg-white/60"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{stage.label}</p>
                        <p className="mt-1 text-sm text-black/65">{stage.goal}</p>
                      </div>
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
                                : isRunning
                                  ? "warn"
                                  : "default"
                          }
                        >
                          {result?.failed
                            ? "unavailable"
                            : result
                              ? "complete"
                              : isRunning
                                ? "reading"
                                : "queued"}
                        </Pill>
                      </div>
                    </div>

                    {isRunning ? (
                      <div className="reading-sweep relative mt-4 h-px overflow-hidden rounded-full bg-pine/15" />
                    ) : null}

                    {result && runState === "running" ? (
                      <p className="stage-settle mt-3 text-sm leading-6 text-black/70">
                        {result.summary}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(32,65,58,0.06))]">
            <h2 className="font-display text-2xl">Architecture</h2>
            {report ? (
              <div className="mt-4 grid gap-4 text-sm text-black/75">
                <SectionList title="System design" items={report.architectureNotes.systemDesign} />
                <SectionList title="UX principles" items={report.architectureNotes.uxPrinciples} />
                <SectionList title="MVP scope" items={report.architectureNotes.mvpScope} />
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-black/70">
                The app uses a server-side orchestrator, typed prompt templates, and an isolated model adapter so the pipeline logic stays reusable if you swap providers later.
              </p>
            )}
          </Card>
        </div>
      </section>

      {report ? (
        <section className="grid gap-6">
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-3xl">Results</h2>
              <Pill tone="good">Role: {report.roleTarget}</Pill>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-4">
              <Metric label="Overall score" value={`${report.scorecard.overallScore}`} count />
              <Metric
                label="ATS score"
                value={report.scorecard.atsScore ? `${report.scorecard.atsScore}` : "N/A"}
                count={Boolean(report.scorecard.atsScore)}
              />
              <Metric
                label="Truthfulness confidence"
                value={`${report.scorecard.truthfulnessConfidence}`}
                count
              />
              <Metric
                label="Interview readiness"
                value={`${report.scorecard.interviewReadiness}`}
                count
              />
            </div>
          </Card>

          {report.topImprovements.length ? (
            <Card>
              <h3 className="font-display text-2xl">Top improvements</h3>
              <ul className="mt-5 grid gap-3 text-sm leading-6">
                {report.topImprovements.map((item, index) => (
                  <li key={`${item}-${index}`} className="rounded-2xl bg-paper px-4 py-3">
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
            <div className="grid gap-6">
              {report.stageResults.map((stage) => (
                <Card
                  key={stage.stageId}
                  className={stage.failed ? "border-rust/25 bg-rust/[0.04]" : undefined}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
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
                  <p className="mt-3 text-sm leading-6 text-black/75">{stage.summary}</p>

                  <div className="mt-5 grid gap-3">
                    {stage.findings.map((finding, index) => (
                      <div key={`${finding.title}-${index}`} className="rounded-3xl border border-black/10 bg-white/60 p-4">
                        <div className="flex items-center gap-3">
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
                          <p className="font-semibold">{finding.title}</p>
                        </div>
                        <p className="mt-3 text-sm text-black/75">{finding.whyItMatters}</p>
                        <p className="mt-2 text-sm font-medium text-black">
                          {finding.recommendation}
                        </p>
                        {finding.evidence.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {finding.evidence.map((evidence, evidenceIndex) => (
                              <button
                                key={`${evidence.quote}-${evidenceIndex}`}
                                type="button"
                                onClick={() => traceEvidence(evidence.quote)}
                                title="Select this text in your resume"
                                className="max-w-full rounded-full bg-black/5 px-3 py-1 text-left text-xs text-black/70 outline-none transition hover:bg-rust/12 hover:text-rust focus-visible:ring-2 focus-visible:ring-rust/40"
                              >
                                <span className="line-clamp-2">
                                  &ldquo;{evidence.quote}&rdquo;
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  {stage.guardrail.unsupportedClaims.length ? (
                    <div className="mt-5 rounded-3xl border border-rust/20 bg-rust/5 p-4">
                      <p className="text-sm font-semibold text-rust">
                        Claims this stage could not support
                      </p>
                      <ul className="mt-2 space-y-2 text-sm leading-6 text-black/75">
                        {stage.guardrail.unsupportedClaims.map((claim, index) => (
                          <li key={`${claim}-${index}`}>{claim}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {stage.followUpQuestions.length ? (
                    <div className="mt-5 rounded-3xl bg-pine/5 p-4">
                      <p className="text-sm font-semibold text-pine">
                        Answer these and the rewrite gets stronger
                      </p>
                      <ul className="mt-2 space-y-2 text-sm leading-6 text-black/75">
                        {stage.followUpQuestions.map((question, index) => (
                          <li key={`${question}-${index}`}>{question}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </Card>
              ))}
            </div>

            <Card className="h-fit">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-2xl">Rewrite draft</h3>
                <Pill tone="warn">Guarded</Pill>
              </div>
              <p className="mt-3 text-sm leading-6 text-black/70">
                This rewrite is allowed to improve language and structure, but not to add unsupported facts. Gaps should be marked inline.
              </p>
              <pre className="mt-5 overflow-x-auto rounded-3xl bg-black p-5 text-sm leading-6 text-white whitespace-pre-wrap">
                {report.rewriteDraft || "No rewrite was produced."}
              </pre>
            </Card>
          </div>
        </section>
      ) : null}
    </main>
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
  count = false
}: {
  label: string;
  value: string;
  count?: boolean;
}) {
  const numeric = count ? Number(value) : Number.NaN;
  const animated = useCountUp(Number.isFinite(numeric) ? numeric : null);

  return (
    <div className="rounded-[24px] border border-black/10 bg-white/70 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.2em] text-black/60">{label}</p>
      <p className="mt-2 font-display text-3xl tabular-nums">
        {Number.isFinite(numeric) ? animated : value}
      </p>
    </div>
  );
}

function SectionList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.2em] text-black/60">{title}</p>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item} className="rounded-2xl bg-white/70 px-4 py-3">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

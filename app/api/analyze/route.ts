import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { streamResumeAnalysis } from "@/lib/pipeline/run-analysis";
import { AnalysisEvent } from "@/lib/types";

const requestSchema = z.object({
  resumeText: z.string().min(80, "Resume text should be at least 80 characters."),
  jobDescription: z.string().optional(),
  targetRole: z.string().optional(),
  followUpContext: z.string().max(20_000).optional()
});

export async function POST(request: NextRequest) {
  let payload;

  try {
    payload = requestSchema.parse(await request.json());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to analyze the resume.";

    return NextResponse.json({ error: message }, { status: 400 });
  }

  const encoder = new TextEncoder();

  // Newline-delimited JSON: one event per line, flushed as each stage resolves.
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AnalysisEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        for await (const event of streamResumeAnalysis(payload)) {
          send(event);
        }
      } catch (error) {
        send({
          type: "error",
          message:
            error instanceof Error ? error.message : "The analysis stopped early."
        });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Keep proxies from buffering the run into one delivery at the end.
      "X-Accel-Buffering": "no"
    }
  });
}

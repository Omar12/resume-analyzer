import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildFollowUpMarkdown, buildResumeMarkdown } from "@/lib/follow-up-document";
import { AnalysisReport } from "@/lib/types";

const requestSchema = z.object({
  report: z.any(),
  format: z.enum(["json", "markdown", "resume-markdown"])
});

export async function POST(request: NextRequest) {
  const { report, format } = requestSchema.parse(await request.json());

  if (format === "json") {
    return new NextResponse(JSON.stringify(report, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": "attachment; filename=resume-analysis.json"
      }
    });
  }

  if (format === "resume-markdown") {
    const resumeText = buildResumeMarkdown(
      z.object({ resumeText: z.string(), rewriteDraft: z.string() }).parse(report)
    );

    return new NextResponse(resumeText, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": "attachment; filename=resume.md"
      }
    });
  }

  return new NextResponse(buildFollowUpMarkdown(report), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": "attachment; filename=resume-analysis.md"
    }
  });
}

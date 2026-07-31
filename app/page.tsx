import { ResumeAnalyzer } from "@/components/resume-analyzer";
import { Analytics } from "@vercel/analytics/next"

export default function HomePage() {
  return (
    <>
      <ResumeAnalyzer />
      <Analytics />
    </>
  );
}

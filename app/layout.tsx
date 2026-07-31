import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resume Analysis Pipeline",
  description: "Structured AI review for resumes with evidence-aware guardrails."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}

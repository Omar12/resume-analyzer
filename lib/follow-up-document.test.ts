import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFollowUpMarkdown } from "./follow-up-document.ts";

const resume = `Taylor Example
Senior Software Engineer

EXPERIENCE
Led the reporting platform migration for enterprise customers and partnered with product on release quality improvements. Built TypeScript services and React interfaces for customer analytics workflows.`;

test("parses a completed follow-up workbook without treating its snapshot as resume text", () => {
  const workbook = `# Resume Analysis Follow-up Workbook

## Target role

Staff Software Engineer

## Job description (optional)

Build reliable distributed systems.

## Updated resume

${resume}

## Completed suggestions

### Suggestion 1

**Recommendation:** Add verified impact.

**Your response:**
Reduced incident recovery time from 52 to 19 minutes after adding release checks.

## Follow-up questions

### achievement-mining question 1

**Question:** What was the scale?

**Answer:**
The workflow supported 1,200 enterprise customers.

## Original analysis snapshot

This must not become part of the resume.`;

  const parsed = parseFollowUpMarkdown(workbook);

  assert.ok(parsed);
  assert.equal(parsed.targetRole, "Staff Software Engineer");
  assert.equal(parsed.jobDescription, "Build reliable distributed systems.");
  assert.equal(parsed.resumeText, resume);
  assert.match(parsed.followUpContext ?? "", /52 to 19 minutes/);
  assert.match(parsed.followUpContext ?? "", /1,200 enterprise customers/);
  assert.doesNotMatch(parsed.resumeText, /must not become part/);
});

test("rejects ordinary Markdown and workbooks without a substantive updated resume", () => {
  assert.equal(parseFollowUpMarkdown("# Notes\n\nSome resume advice"), null);
  assert.equal(
    parseFollowUpMarkdown("# Resume Analysis Follow-up Workbook\n\n## Updated resume\n\nToo short"),
    null
  );
});

// Run with: npm test  (node --experimental-strip-types --test)
import assert from "node:assert/strict";
import { test } from "node:test";
import { findQuoteRange } from "./evidence.ts";

const resume = `Alex Morgan
Senior Software Engineer

Experience
Lead engineer for a B2B analytics platform
used by enterprise customers.`;

test("finds an exact quote", () => {
  const range = findQuoteRange(resume, "Lead engineer for a B2B analytics platform");
  assert.ok(range);
  assert.equal(range.exact, true);
  assert.equal(resume.slice(range.start, range.end), "Lead engineer for a B2B analytics platform");
});

test("matches across a line break the model collapsed", () => {
  const range = findQuoteRange(resume, "analytics platform used by enterprise customers.");
  assert.ok(range);
  assert.equal(range.exact, true);
  assert.match(resume.slice(range.start, range.end), /analytics platform\nused by/);
});

test("falls back to a leading fragment and reports it as inexact", () => {
  const range = findQuoteRange(resume, "Lead engineer for a B2B analytics platform serving 40M users");
  assert.ok(range);
  assert.equal(range.exact, false);
  assert.equal(resume.slice(range.start, range.end), "Lead engineer for a B2B analytics platform");
});

test("returns null for a quote the resume never made", () => {
  assert.equal(findQuoteRange(resume, "Reduced infrastructure spend by 42 percent"), null);
});

test("does not treat regex metacharacters as syntax", () => {
  assert.equal(findQuoteRange(resume, "C++ (advanced) [expert]"), null);
});

test("ignores an empty or whitespace-only quote", () => {
  assert.equal(findQuoteRange(resume, "   "), null);
});

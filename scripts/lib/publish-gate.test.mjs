// Tests for the Storyblok publish gate. The gate's whole value is refusing, so
// every refusal has a case, and the one "go" case proves it is not refusing
// everything.

import { test } from "node:test";
import assert from "node:assert/strict";
import { refusals, staleApprovals, ACTIVE_RUN_STATES } from "./publish-gate.mjs";

const SHA = "818e6a1bf92e6b90664e748d1b4c24dfbba85c95";
const clean = { head: SHA, originMain: SHA, dirty: [], misses: [], stale: 0, activeRuns: [] };

test("a clean main with a covering cache and an idle queue may publish", () => {
  assert.deepEqual(refusals(clean), []);
});

test("refuses a checkout that is not origin/main", () => {
  const r = refusals({ ...clean, head: "e4e6fea020de4c07b5b8d855ced180069b21db37" });
  assert.equal(r.length, 1);
  assert.match(r[0], /not origin\/main/);
});

test("refuses when origin/main could not be read", () => {
  assert.match(refusals({ ...clean, originMain: "" })[0], /not origin\/main/);
});

test("refuses a dirty tree, since its cache is not main's", () => {
  assert.match(refusals({ ...clean, dirty: ["scripts/.i18n-cache.json"] })[0], /uncommitted/);
});

test("refuses any cache miss and names the locales", () => {
  const misses = [
    { locale: "fr", source: "a" },
    { locale: "pt", source: "a" },
    { locale: "fr", source: "b" },
  ];
  const r = refusals({ ...clean, misses });
  assert.equal(r.length, 1);
  assert.match(r[0], /^3 draft string\(s\).*\(fr 2, pt 1\)/);
});

test("refuses a stale DE/ES approval", () => {
  assert.match(refusals({ ...clean, stale: 2 })[0], /stale approval/);
});

test("refuses while any deploy run is active", () => {
  const r = refusals({ ...clean, activeRuns: [{ databaseId: 1, status: "pending" }, { databaseId: 2, status: "queued" }] });
  assert.equal(r.length, 2);
});

test("watches every non-final run state, not just queued and in_progress", () => {
  assert.deepEqual([...ACTIVE_RUN_STATES].sort(), ["in_progress", "pending", "queued", "requested", "waiting"]);
});

test("reads the stale-approval count from fetch-blog's warnings, across locales", () => {
  const out =
    "✓ fetch-blog: 3 reviewed post(s)\n" +
    "::warning title=Stale translation approval::1 de article variant(s) were dropped\n" +
    "::warning title=Stale translation approval::2 es article variant(s) were dropped\n";
  assert.equal(staleApprovals(out), 3);
  assert.equal(staleApprovals("✓ fetch-blog: 3 reviewed post(s)\n"), 0);
});

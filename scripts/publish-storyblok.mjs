// Publish Storyblok stories only when main's committed cache can serve them.
//
//   ~/bin/op-sa run --env-file ~/.env -- node scripts/publish-storyblok.mjs [--check] <story> [<story> ...]
//
// <story> is a numeric story id or a full slug (pages/home, blog/my-post).
// --check measures and stops: nothing is published.
//
// WHY. A publish deploys main (see scripts/lib/publish-gate.mjs). This runs the
// deploy's own fetch scripts, cache-only and keyless, against the DRAFT copy
// from a checkout that must be exactly origin/main, and refuses on any cache
// miss, any stale DE/ES approval, or any deploy run still in flight. Only then
// does it publish, and it then waits for the deploy runs the publish creates.
//
// Draft mode reads every story's draft, not only the ones named here, so an
// unrelated unpublished draft can make it refuse. That errs on the safe side.
//
// Needs STORYBLOK_PREVIEW_TOKEN and STORYBLOK_MANAGEMENT_TOKEN, and `gh` logged in.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { activeRuns, refusals, staleApprovals } from "./lib/publish-gate.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPACE_ID = "288632938663524";
const MAPI = `https://mapi.storyblok.com/v1/spaces/${SPACE_ID}`;

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const refs = args.filter((a) => a !== "--check");
if (!refs.length || refs.some((r) => !/^(\d+|[a-z0-9-]+(\/[a-z0-9-]+)+)$/.test(r))) {
  console.error("usage: publish-storyblok.mjs [--check] <story id | full slug> ...");
  process.exit(2);
}
for (const name of ["STORYBLOK_PREVIEW_TOKEN", "STORYBLOK_MANAGEMENT_TOKEN"]) {
  if (!(process.env[name] ?? "").trim()) {
    console.error(`publish-storyblok: ${name} is not set; run it under ~/bin/op-sa run --env-file ~/.env`);
    process.exit(2);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { cwd: root, encoding: "utf8", ...opts });
  if (r.status !== 0 && !opts.allowFail) {
    console.error(`publish-storyblok: ${cmd} ${argv.join(" ")} failed (exit ${r.status})\n${r.stdout ?? ""}${r.stderr ?? ""}`);
    process.exit(1);
  }
  return r;
}

async function mapi(path) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await sleep(250);
    const res = await fetch(`${MAPI}${path}`, { headers: { Authorization: process.env.STORYBLOK_MANAGEMENT_TOKEN } });
    if (res.ok) return res.json();
    const detail = await res.text().catch(() => "");
    if (!(res.status === 429 || res.status >= 500) || attempt === 3) {
      throw new Error(`GET ${path} -> ${res.status}: ${detail.slice(0, 300)}`);
    }
  }
}

async function resolveStory(ref) {
  if (/^\d+$/.test(ref)) return (await mapi(`/stories/${ref}`)).story;
  const { stories } = await mapi(`/stories?with_slug=${encodeURIComponent(ref)}`);
  if (stories?.length !== 1) throw new Error(`no single story with full slug ${ref}`);
  return stories[0];
}

function listDeployRuns() {
  return JSON.parse(run("gh", ["run", "list", "--workflow", "deploy.yml", "--limit", "50", "--json", "databaseId,status"]).stdout);
}

/** Run the deploy's fetch scripts against the drafts, cache-only and keyless. */
function measureDrafts() {
  const report = resolve(mkdtempSync(resolve(tmpdir(), "publish-gate-")), "misses.json");
  const env = {
    ...process.env,
    STORYBLOK_PUBLIC_TOKEN: process.env.STORYBLOK_PREVIEW_TOKEN,
    STORYBLOK_VERSION: "draft",
    STORYBLOK_REQUIRE_TOKEN: "1",
    DEEPL_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    I18N_CACHE_ONLY: "1",
    I18N_MISS_REPORT: report,
    I18N_FAIL_ON_MISSING_TRANSLATION: "0",
  };
  let output = "";
  for (const script of ["scripts/fetch-blog.mjs", "scripts/fetch-pages.mjs"]) {
    const r = run("node", [script], { env });
    output += `${r.stdout}${r.stderr}`;
  }
  const misses = existsSync(report) ? JSON.parse(readFileSync(report, "utf8")).flatMap((r) => r.missing ?? []) : [];
  return { misses, stale: staleApprovals(output) };
}

function gate() {
  run("git", ["fetch", "--quiet", "origin", "main"]);
  const head = run("git", ["rev-parse", "HEAD"]).stdout.trim();
  const originMain = run("git", ["rev-parse", "origin/main"]).stdout.trim();
  const dirty = run("git", ["status", "--porcelain"]).stdout.split("\n").filter(Boolean).map((l) => l.slice(3));
  return { head, originMain, dirty, ...measureDrafts(), activeRuns: activeRuns(listDeployRuns()) };
}

const stories = [];
for (const ref of refs) stories.push(await resolveStory(ref));
console.log(`publish-storyblok: ${stories.map((s) => `${s.full_slug} (${s.id})`).join(", ")}`);

const state = gate();
const no = refusals(state);
console.log(`  main ${state.originMain.slice(0, 7)}, ${state.misses.length} miss(es), ${state.stale} stale approval(s), ${state.activeRuns.length} active deploy run(s)`);
if (no.length) {
  console.error("publish-storyblok: REFUSED, nothing was published:");
  for (const reason of no) console.error(`  - ${reason}`);
  process.exit(1);
}
if (checkOnly) {
  console.log("publish-storyblok: main's cache serves the drafts; --check, so nothing was published.");
  process.exit(0);
}

// Main may have moved during the measurement; a new head means a new cache.
run("git", ["fetch", "--quiet", "origin", "main"]);
if (run("git", ["rev-parse", "origin/main"]).stdout.trim() !== state.originMain) {
  console.error("publish-storyblok: REFUSED, origin/main moved during the check; run it again.");
  process.exit(1);
}
// The measurement takes a minute or two; a deploy can start in that window.
const lateRuns = activeRuns(listDeployRuns());
if (lateRuns.length) {
  console.error(`publish-storyblok: REFUSED, deploy run ${lateRuns.map((r) => r.databaseId).join(", ")} started during the check; nothing was published.`);
  process.exit(1);
}

const since = Date.now() - 5_000;
let failed = 0;
for (const s of stories) {
  try {
    const out = (await mapi(`/stories/${s.id}/publish`)).story ?? {};
    console.log(`  published ${s.full_slug} published_at=${out.published_at ?? "MISSING"}`);
    if (!out.published_at) failed++;
  } catch (err) {
    failed++;
    console.error(`  FAILED ${s.full_slug}: ${err.message}`);
  }
}

// Read the runs the publish created: wait for them to appear, then to finish.
const deadline = Date.now() + 25 * 60_000;
let runs = [];
let quietSince = Date.now();
while (Date.now() < deadline) {
  await sleep(15_000);
  const list = JSON.parse(
    run("gh", ["run", "list", "--workflow", "deploy.yml", "--limit", "20", "--json", "databaseId,status,conclusion,createdAt,headSha,url"]).stdout,
  ).filter((r) => Date.parse(r.createdAt) >= since);
  if (list.length !== runs.length) quietSince = Date.now();
  runs = list;
  const settled = runs.length > 0 && runs.every((r) => r.status === "completed");
  if (settled && Date.now() - quietSince > 60_000) break;
  if (!runs.length && Date.now() - since > 3 * 60_000) break;
}
if (!runs.length) {
  console.error("publish-storyblok: no deploy run appeared within 3 minutes; check the webhook relay.");
  process.exit(1);
}
for (const r of runs) console.log(`  deploy ${r.databaseId} ${r.status}/${r.conclusion || "-"} ${r.headSha.slice(0, 7)} ${r.url}`);
// A superseded pending run is cancelled by the `pages` concurrency group, which
// is normal; the newest run must succeed and none may fail.
const newest = runs.reduce((a, b) => (Date.parse(a.createdAt) >= Date.parse(b.createdAt) ? a : b));
const bad = runs.some((r) => r.status !== "completed" || r.conclusion === "failure") || newest.conclusion !== "success";
if (bad || failed) {
  console.error("publish-storyblok: the publish or its deploy did NOT finish green; main is red, fix it now.");
  process.exit(1);
}
console.log("publish-storyblok: published and deployed green.");

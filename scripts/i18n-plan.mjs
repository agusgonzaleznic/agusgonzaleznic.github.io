// Decide, without spending a cent, whether any copy actually needs translating.
//
// WHY. `npm run build` runs fetch-blog and fetch-pages, and both call DeepL and
// Claude for any English string missing from the committed cache. CI never
// commits that cache back, so a string that missed once was paid for again on
// every later deploy. Both quotas ran out that way.
//
// HOW. This runs the real pipeline in cache-only mode (I18N_CACHE_ONLY=1) with
// the paid keys deliberately cleared, so it cannot spend anything, and reads
// back the gaps the two scripts recorded. Running the real scripts rather than
// re-implementing their string enumeration is the point: a separate
// implementation would drift from what the build actually looks up, and the
// gate would then be confidently wrong.
//
// The deploy workflow reads `needed` from here and hands the build the API keys
// only when it is true. On a normal merge, which changes no copy, the answer is
// false and the build provably cannot spend: it has no credentials.
//
// NOTE: this regenerates src/generated/*.json in cache-only form. Harmless, the
// build re-runs both fetch scripts immediately afterwards. Those files are
// gitignored.

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const reportPath = resolve(mkdtempSync(resolve(tmpdir(), "i18n-plan-")), "misses.json");

if (!(process.env.STORYBLOK_PUBLIC_TOKEN ?? "").trim()) {
  console.error(
    "i18n-plan: STORYBLOK_PUBLIC_TOKEN is not set, so the live copy cannot be read and\n" +
      "           the plan would report 'nothing to translate' for the wrong reason.",
  );
  process.exit(1);
}

const env = {
  ...process.env,
  // Cleared, not just unused: the plan must be incapable of spending.
  DEEPL_API_KEY: "",
  ANTHROPIC_API_KEY: "",
  I18N_CACHE_ONLY: "1",
  I18N_MISS_REPORT: reportPath,
  STORYBLOK_REQUIRE_TOKEN: "1",
  // Report the gaps, do not fail on them: deciding what to do about them is the
  // caller's job.
  I18N_FAIL_ON_MISSING_TRANSLATION: "0",
};

for (const script of ["scripts/fetch-blog.mjs", "scripts/fetch-pages.mjs"]) {
  const r = spawnSync("node", [script], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (r.status !== 0) {
    console.error(`i18n-plan: ${script} failed in cache-only mode (exit ${r.status}).\n${out}`);
    process.exit(1);
  }
  for (const line of out.split("\n").filter((l) => /cache-only|miss\(es\)|⚠/.test(l))) {
    console.log(`  ${line.trim()}`);
  }
}

const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : [];
const missing = report.flatMap((r) => r.missing ?? []);
const byLocale = new Map();
for (const m of missing) byLocale.set(m.locale, (byLocale.get(m.locale) ?? 0) + 1);
const chars = missing.reduce((n, m) => n + m.source.length, 0);
// One unique English string is charged once per target locale it is missing for.
const uniqueSources = new Set(missing.map((m) => m.source)).size;

console.log("");
if (missing.length === 0) {
  console.log("i18n-plan: nothing to translate. The committed cache answers every string,");
  console.log("           so the build runs with no DeepL or Anthropic key at all.");
} else {
  console.log(`i18n-plan: ${missing.length} string(s) need translating, across ${byLocale.size} locale(s).`);
  for (const [locale, n] of [...byLocale].sort()) console.log(`             ${locale}: ${n}`);
  console.log(`           ${uniqueSources} unique English string(s), ${chars} source character(s) of DeepL quota.`);
  for (const m of missing.slice(0, 10)) console.log(`             ${m.locale}: ${m.source.slice(0, 100)}`);
  if (missing.length > 10) console.log(`             ... and ${missing.length - 10} more`);
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `needed=${missing.length > 0}\nmisses=${missing.length}\ncharacters=${chars}\n`,
  );
}
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    missing.length === 0
      ? "\n### Translation plan\n\nNo copy changed. The build runs without translation credentials.\n"
      : `\n### Translation plan\n\n${missing.length} string(s) need translating ` +
          `(${uniqueSources} unique, ${chars} DeepL characters).\n`,
  );
}

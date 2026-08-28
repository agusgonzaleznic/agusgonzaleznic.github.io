// The translation budget gate.
//
// WHY THIS EXISTS. Paid translation used to be a side effect of every deploy:
// `npm run build` always runs fetch-blog and fetch-pages, both of which call
// DeepL and Claude for any English string missing from the committed cache. CI
// never commits the cache back, so a string that missed once was paid for again
// on EVERY subsequent deploy, forever. With a busy merge cadence that is what
// exhausted both quotas: the 2026-08-27 15:49 deploy shows 5 misses hitting an
// already-exhausted DeepL (HTTP 456) and 5 failed Claude calls, on a commit that
// had built cleanly hours earlier with 0 calls.
//
// So paying is explicit now. `I18N_CACHE_ONLY=1` answers every string from the
// committed cache and never calls a paid API. The deploy workflow runs the whole
// pipeline in that mode first (scripts/i18n-plan.mjs) to find out whether any
// copy actually changed, and only hands the build the API keys when it did.
//
// `I18N_FAIL_ON_MISSING_TRANSLATION=1` then makes a gap loud: without it a
// cache-only build quietly renders English on a localized page, which is exactly
// the kind of failure nobody notices until a reader does.

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

/** True when this run must answer from the cache and never pay. */
export function cacheOnlyMode() {
  return process.env.I18N_CACHE_ONLY === "1";
}

/** True when a gap in the cache should fail the build rather than fall back to English. */
export function failOnMissing() {
  return process.env.I18N_FAIL_ON_MISSING_TRANSLATION === "1";
}

function appendReport(label, stats) {
  const path = process.env.I18N_MISS_REPORT;
  if (!path) return;
  let all = [];
  try {
    all = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(all)) all = [];
  } catch {
    // First writer of the run, or an unreadable file: start clean.
  }
  all.push({
    label,
    missing: stats.missing ?? [],
    untranslated: stats.untranslated ?? [],
    dashViolations: stats.dashViolations ?? [],
  });
  writeFileSync(path, `${JSON.stringify(all, null, 2)}\n`);
}

/**
 * Print what this run cost, record any gap, and decide whether to fail.
 *
 * Called once per fetch script with that script's translator stats. Returns the
 * number of distinct (locale, source) pairs the cache could not answer.
 */
export function reportTranslationBudget(label, stats) {
  const missing = stats.missing ?? [];
  const untranslated = stats.untranslated ?? [];
  const violations = stats.dashViolations ?? [];
  const paid = stats.apiCalls ?? 0;

  const chars = missing.reduce((n, m) => n + m.source.length, 0);
  console.log(
    `  ${label}: cache ${stats.cacheHits ?? 0} hit(s), ${missing.length} miss(es)` +
      ` (${chars} source char(s)), ${paid} DeepL call(s), ${stats.translated ?? 0} string(s) translated.`,
  );

  appendReport(label, stats);

  const untranslatable = stats.noTranslatableContent ?? [];
  if (untranslatable.length) {
    // Masking left only sentinels, so a translator saw nothing and the English
    // comes back unchanged. For a plural that means the message stays English.
    console.log(
      `::warning title=Nothing to translate::${untranslatable.length} string(s) in ${label} were masked ` +
        "down to placeholders only, so they come back as their English source",
    );
    for (const u of untranslatable.slice(0, 6)) {
      console.warn(`  ${label}: ${u.locale} received no translatable text for: ${u.source.slice(0, 100)}`);
    }
  }

  const unpersisted = stats.unpersisted ?? [];
  if (unpersisted.length) {
    // Not an error: the run is correct, it just cannot be allowed to pin raw MT
    // into a cache that a later post-edited build would then never revisit.
    console.log(
      `::warning title=Translation not cached::${unpersisted.length} string(s) translated without the ` +
        "post-edit pass, used for this build only",
    );
    console.warn(
      `  ${label}: ${unpersisted.length} string(s) were translated by DeepL alone and deliberately NOT\n` +
        "    written to the cache, because raw output would occupy the post-edited key forever.\n" +
        "    Re-run with ANTHROPIC_API_KEY set to translate and cache them properly.",
    );
  }

  if (violations.length) {
    // The house style forbids the em dash. de/es are normalised to the permitted
    // en dash automatically; fr/it/pt have no safe mechanical rewrite, so they
    // surface here instead of shipping.
    console.log(`::error title=Em dash in a translation::${violations.length} string(s) from ${label}`);
    for (const v of violations.slice(0, 10)) {
      console.error(`  ${label}: ${v.locale} translation carries an em dash: ${v.translation.slice(0, 120)}`);
    }
    process.exitCode = 1;
  }

  if (cacheOnlyMode() && missing.length && failOnMissing()) {
    console.log(
      `::error title=Untranslated copy::${missing.length} string(s) are not in the committed translation cache`,
    );
    console.error(
      `\n${label}: ${missing.length} string(s) have no cached translation and this build is not\n` +
        "allowed to pay for one, so those strings would render in English.\n\n" +
        "To fix: run a local build with DEEPL_API_KEY and ANTHROPIC_API_KEY set\n" +
        "(op run --env-file ~/.env --no-masking -- npm run build), then commit the\n" +
        "updated scripts/.i18n-cache.json. Translation is then paid for once, ever.\n" +
        "Set the I18N_TRANSLATION repo variable to 'auto' to let a deploy pay instead.\n",
    );
    for (const m of missing.slice(0, 12)) {
      console.error(`  ${m.locale}: ${m.source.slice(0, 110)}`);
    }
    if (missing.length > 12) console.error(`  ... and ${missing.length - 12} more`);
    process.exitCode = 1;
  } else if (untranslated.length) {
    console.log(
      `::warning title=Untranslated copy::${untranslated.length} string(s) fell back to English in ${label}`,
    );
  }

  if (process.env.GITHUB_STEP_SUMMARY && missing.length) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `\n**${label}**: ${missing.length} string(s) missing from the translation cache (${chars} chars).\n`,
    );
  }
  return missing.length;
}

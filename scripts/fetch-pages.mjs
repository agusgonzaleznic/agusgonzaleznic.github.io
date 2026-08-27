// Build-time Storyblok fetch for MARKETING PAGES. Runs before `vite build` (and
// before `vite` dev via predev) so src/generated/page-data.json always exists
// when the app imports it (src/lib/pages.ts). Sibling of scripts/fetch-blog.mjs.
//
// SECURITY: reads process.env.STORYBLOK_PUBLIC_TOKEN, never import.meta.env or a
// VITE_-prefixed var, so the token can't reach the client bundle. Page content
// is public and safe to bake in.
//
// i18n: English is the source in Storyblok; every published non-source locale is
// auto-translated at build (DeepL + optional Claude post-edit), reusing the exact
// blog pipeline + committed content-hash cache. The cache is primed from the
// current translations (scripts/seed-storyblok-pages.mjs), so day-one output is
// byte-identical to today in every language. Keyless (no DEEPL_API_KEY) → cache
// hits still serve the primed wording; a genuine miss falls back to English.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createTranslator,
  deeplQuotaNotice,
  hasApiKey,
  loadCache,
  loadGlossary,
  loadGlossaryTerms,
  readPublishedLocales,
  saveCache,
  SOURCE_LOCALE,
} from "./lib/deepl.mjs";
// POSTEDIT_VERSION is deliberately NOT imported: page translations are salted
// with PAGE_CACHE_SALT instead, so cache priming stays deterministic whether or
// not ANTHROPIC_API_KEY is present in a given build (see the salt note below).
import { cacheOnlyMode, reportTranslationBudget } from "./lib/i18n-budget.mjs";
import { createPostEditor, hasAnthropicKey } from "./lib/llm-postedit.mjs";
import { pageDataFilename, translatePage, applyReviewedPage } from "./lib/page-translate.mjs";
import {
  loadPageApprovals,
  isPageApproved,
  pageSlug,
  loadReviewedPage,
} from "./lib/page-gate.mjs";
import { fetchStoriesByPrefix } from "./lib/storyblok-fetch.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const generatedDir = resolve(__dirname, "../src/generated");
const cachePath = resolve(__dirname, ".i18n-cache.json");
const glossaryPath = resolve(__dirname, "i18n-glossary.json");
const localesTsPath = resolve(__dirname, "../src/i18n/locales.ts");
// Human-review store + approvals for marketing pages (page analogue of the blog's
// content/translations + content/i18n-approvals.json). See scripts/lib/page-gate.mjs.
const contentPagesDir = resolve(__dirname, "../content/pages");
const pageApprovalsPath = resolve(__dirname, "../content/page-approvals.json");

const PAGES_PREFIX = "pages/";
const PAGE_CONTENT_TYPE = "page";
// Fixed cache salt for marketing pages so priming is deterministic regardless of
// whether ANTHROPIC_API_KEY is present in a given build (the post-edit still runs
// on a genuine cache MISS; a primed HIT returns the reviewed wording verbatim).
const PAGE_CACHE_SALT = "pages-v1";

const token = process.env.STORYBLOK_PUBLIC_TOKEN;
const version = process.env.STORYBLOK_VERSION === "draft" ? "draft" : "published";
const requireToken = process.env.STORYBLOK_REQUIRE_TOKEN === "1";

function writeOutput(file, data) {
  mkdirSync(generatedDir, { recursive: true });
  writeFileSync(resolve(generatedDir, file), `${JSON.stringify(data, null, 2)}\n`);
}

async function translatePagesForLocales(pages) {
  const published = readPublishedLocales(localesTsPath);
  const targets = published.filter((l) => l !== SOURCE_LOCALE);
  if (pages.length === 0 || targets.length === 0) return;

  // Cache-only is the normal deploy mode: the gate (scripts/i18n-plan.mjs) has
  // already established that the committed cache answers every string, so the
  // build is handed no API keys at all and cannot spend anything.
  const cacheOnly = cacheOnlyMode();
  if (cacheOnly) {
    console.log("  fetch-pages: cache-only, no paid translation call will be made.");
  } else if (!hasApiKey()) {
    console.log(
      "  fetch-pages: DEEPL_API_KEY not set, locale pages fall back to English " +
        "(a primed cache still serves reviewed wording when present).",
    );
  }

  const cache = loadCache(cachePath);
  for (const l of (process.env.REGEN_LOCALES ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    delete cache.translations[l];
  }
  const glossaryRegex = loadGlossary(glossaryPath);
  const postEditor = hasAnthropicKey() && !cacheOnly
    ? createPostEditor({
        apiKey: process.env.ANTHROPIC_API_KEY.trim(),
        glossaryTerms: loadGlossaryTerms(glossaryPath),
      })
    : null;
  const translator = createTranslator({
    apiKey: (process.env.DEEPL_API_KEY ?? "").trim(),
    glossaryRegex,
    cache,
    postEditor,
    cacheSalt: PAGE_CACHE_SALT,
    cacheOnly,
  });

  // Review gate: a (page, locale) that is approved AND hash-fresh is served
  // VERBATIM from content/pages/<slug>.<locale>.json (reviewed copy overlaid on
  // the live English structure), so the GitHub Actions machine translation never
  // overwrites human-reviewed marketing copy. Everything un-reviewed/stale is
  // machine-translated exactly as before. With no approvals present, every page
  // is MT'd → output identical to pre-gate builds.
  const approvals = loadPageApprovals(pageApprovalsPath);
  for (const locale of targets) {
    const localized = [];
    let verbatim = 0;
    for (const page of pages) {
      let out = null;
      if (isPageApproved(page, locale, approvals)) {
        const reviewed = loadReviewedPage(contentPagesDir, pageSlug(page), locale);
        if (reviewed) out = applyReviewedPage(page, reviewed); // null if structure drifted → MT
      }
      if (out) verbatim += 1;
      else out = await translatePage(page, locale, translator);
      localized.push(out);
    }
    writeOutput(pageDataFilename(locale), localized);
    console.log(
      `✓ fetch-pages: ${localized.length} page(s) → src/generated/${pageDataFilename(locale)}` +
        (verbatim ? ` (${verbatim} reviewed verbatim, ${localized.length - verbatim} machine-translated)` : ""),
    );
  }
  // DeepL quota fallback: if DeepL ran out mid-build, the strings above were
  // translated by Claude instead (no build failure), so surface it loudly.
  if (translator.stats.deeplExhausted) {
    const notice = await deeplQuotaNotice((process.env.DEEPL_API_KEY ?? "").trim());
    console.log(`::warning title=DeepL quota exhausted::${notice}`);
    console.warn(`⚠ fetch-pages: ${notice} (${translator.stats.claudeFromScratch} string(s) translated by Claude)`);
  }
  reportTranslationBudget("fetch-pages", translator.stats);
  // Nothing was translated in cache-only mode, so leave the committed cache
  // untouched rather than rewriting it byte-for-byte.
  if (!cacheOnly) saveCache(cachePath, cache);
  if (postEditor) {
    const { postEdited, keptMt, failures } = postEditor.stats;
    console.log(
      `✓ fetch-pages: LLM post-edit: ${postEdited} refined, ${keptMt} kept as raw DeepL` +
        `${failures ? `, ${failures} call(s) failed` : ""}.`,
    );
  }
}

if (!token) {
  if (requireToken) {
    console.error(
      "fetch-pages: STORYBLOK_PUBLIC_TOKEN is not set but STORYBLOK_REQUIRE_TOKEN=1.",
    );
    process.exit(1);
  }
  console.warn(
    "\n⚠ fetch-pages: STORYBLOK_PUBLIC_TOKEN not set, writing empty page data.\n" +
      "  Marketing pages render their hardcoded fallback copy in this build.\n",
  );
  writeOutput("page-data.json", []);
  process.exit(0);
}

try {
  const pages = await fetchStoriesByPrefix({
    token,
    version,
    starts_with: PAGES_PREFIX,
    content_type: PAGE_CONTENT_TYPE,
  });
  writeOutput("page-data.json", pages);
  console.log(
    `✓ fetch-pages: ${pages.length} page(s) (version=${version}) → src/generated/page-data.json`,
  );
  await translatePagesForLocales(pages);
} catch (err) {
  console.error(`fetch-pages: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

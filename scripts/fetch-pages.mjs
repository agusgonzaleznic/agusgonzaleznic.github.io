// Build-time Storyblok fetch for MARKETING PAGES. Runs before `vite build` (and
// before `vite` dev via predev) so src/generated/page-data.json always exists
// when the app imports it (src/lib/pages.ts). Sibling of scripts/fetch-blog.mjs.
//
// SECURITY: reads process.env.STORYBLOK_PUBLIC_TOKEN — never import.meta.env or a
// VITE_-prefixed var — so the token can't reach the client bundle. Page content
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
import { createPostEditor, hasAnthropicKey, POSTEDIT_VERSION } from "./lib/llm-postedit.mjs";
import { pageDataFilename, translatePages } from "./lib/page-translate.mjs";
import { fetchStoriesByPrefix } from "./lib/storyblok-fetch.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const generatedDir = resolve(__dirname, "../src/generated");
const outFile = resolve(generatedDir, "page-data.json");
const cachePath = resolve(__dirname, ".i18n-cache.json");
const glossaryPath = resolve(__dirname, "i18n-glossary.json");
const localesTsPath = resolve(__dirname, "../src/i18n/locales.ts");

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

  if (!hasApiKey()) {
    console.log(
      "  fetch-pages: DEEPL_API_KEY not set — locale pages fall back to English " +
        "(primed cache still serves reviewed wording when present).",
    );
  }

  const cache = loadCache(cachePath);
  for (const l of (process.env.REGEN_LOCALES ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    delete cache.translations[l];
  }
  const glossaryRegex = loadGlossary(glossaryPath);
  const postEditor = hasAnthropicKey()
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
  });

  for (const locale of targets) {
    const localized = await translatePages(pages, locale, translator);
    writeOutput(pageDataFilename(locale), localized);
    console.log(`✓ fetch-pages: ${localized.length} page(s) → src/generated/${pageDataFilename(locale)}`);
  }
  // DeepL quota fallback: if DeepL ran out mid-build, the strings above were
  // translated by Claude instead (no build failure) — surface it loudly.
  if (translator.stats.deeplExhausted) {
    const notice = await deeplQuotaNotice((process.env.DEEPL_API_KEY ?? "").trim());
    console.log(`::warning title=DeepL quota exhausted::${notice}`);
    console.warn(`⚠ fetch-pages: ${notice} (${translator.stats.claudeFromScratch} string(s) translated by Claude)`);
  }
  saveCache(cachePath, cache);
  if (postEditor) {
    const { postEdited, keptMt, failures } = postEditor.stats;
    console.log(
      `✓ fetch-pages: LLM post-edit — ${postEdited} refined, ${keptMt} kept as raw DeepL` +
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
    "\n⚠ fetch-pages: STORYBLOK_PUBLIC_TOKEN not set — writing empty page data.\n" +
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

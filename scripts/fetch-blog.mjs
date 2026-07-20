// Build-time Storyblok fetch. Runs before `vite build` (and before `vite` dev via
// predev) so src/generated/blog-data.json always exists when the app imports it.
//
// SECURITY: reads process.env.STORYBLOK_PUBLIC_TOKEN — never import.meta.env or a
// VITE_-prefixed var — so the token cannot reach the client bundle. The fetched
// content is public and safe to bake in.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
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
import { blogDataFilename, translateStories } from "./lib/richtext-translate.mjs";
import {
  AUTO_LOCALES,
  REVIEW_GATED_LOCALES,
  approvedLocalesFor,
  enSourceHash,
  loadApprovals,
} from "./lib/blog-gate.mjs";
import { fetchPublishedPosts } from "./lib/storyblok-fetch.mjs";
import { loadTagMap, localizeTags, unmappedTags } from "./lib/tag-i18n.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const generatedDir = resolve(__dirname, "../src/generated");
const outFile = resolve(generatedDir, "blog-data.json");
const cachePath = resolve(__dirname, ".i18n-cache.json");
const glossaryPath = resolve(__dirname, "i18n-glossary.json");
const localesTsPath = resolve(__dirname, "../src/i18n/locales.ts");
// Review-gate state (see scripts/lib/blog-gate.mjs).
const approvalsPath = resolve(__dirname, "../content/i18n-approvals.json");
const reviewedDir = resolve(__dirname, "../content/translations");
const tagMapPath = resolve(__dirname, "../content/tag-translations.json");

const token = process.env.STORYBLOK_PUBLIC_TOKEN;
// draft override is for local preview builds only (requires a preview token).
const version = process.env.STORYBLOK_VERSION === "draft" ? "draft" : "published";
// The PR CI workflow (reusable vite-ci.yml) cannot receive secrets, so a
// missing token only fails builds that opt in — deploy.yml sets
// STORYBLOK_REQUIRE_TOKEN=1 so production can never ship an empty blog by
// accident, while PR CI validates the empty-blog code path.
const requireToken = process.env.STORYBLOK_REQUIRE_TOKEN === "1";

function writeOutput(posts) {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(posts, null, 2)}\n`);
}

// Build-time localization of the blog, writing src/generated/blog-data.<locale>.json.
// Two policies (see scripts/lib/blog-gate.mjs), gated on PUBLISHED_LOCALES:
//   - Review-gated locales (DE/ES): served VERBATIM from committed reviewed
//     content (content/translations/<uuid>.<locale>.json) for approved+fresh
//     posts only. No translation, no API key needed — fully deterministic.
//   - Auto locales (FR/IT/PT): translated at build via DeepL (+ optional LLM
//     post-edit). KEYLESS → skipped, so those files fall back to English.
// English (blog-data.json) is written by writeOutput() before this runs; each
// post already carries its baked `approved_locales`.

// A reviewed translation file is a frozen snapshot: it holds the correct
// TRANSLATED text but its GLOBAL, non-translated fields (tags, cover image,
// dates, urls) are stale if the story changed after review. Always take those
// from the CURRENT English story so every locale — reviewed or auto — stays in
// sync. (tag_list is global in Storyblok: one set of tags shared by all locales.)
function withCurrentGlobals(reviewedObj, post) {
  return {
    ...reviewedObj,
    tag_list: post.tag_list,
    cover_image: post.cover_image,
    published_date: post.published_date,
    first_published_at: post.first_published_at,
    published_at: post.published_at,
    original_url: post.original_url,
    canonical_override: post.canonical_override,
    approved_locales: post.approved_locales,
  };
}

// Replace each post's (English) tag_list with localized labels for `locale`,
// warning once about any tag missing from the map (falls back to English).
function localizePostTags(arr, locale, tagMap) {
  const missing = new Set();
  for (const p of arr) {
    for (const t of unmappedTags(p.tag_list, locale, tagMap)) missing.add(t);
    p.tag_list = localizeTags(p.tag_list, locale, tagMap);
  }
  if (missing.size) {
    console.warn(
      `  ⚠ fetch-blog: ${locale} tags with no translation (English fallback): ${[...missing].join(", ")} ` +
        "— run the importer or edit content/tag-translations.json",
    );
  }
}

async function translateBlog(posts) {
  const published = readPublishedLocales(localesTsPath);
  const tagMap = loadTagMap(tagMapPath);

  // Review-gated locales: assemble from committed reviewed content. A post is
  // included only when its approved_locales set contains the locale (approved +
  // hash-fresh); pending / held / stale variants are simply omitted.
  for (const locale of REVIEW_GATED_LOCALES) {
    if (!published.includes(locale)) continue;
    const reviewed = [];
    for (const post of posts) {
      if (!post.approved_locales.includes(locale)) continue;
      const file = resolve(reviewedDir, `${post.uuid}.${locale}.json`);
      if (!existsSync(file)) {
        // Approved in the manifest but the reviewed content is missing — fail
        // loud rather than silently drop a supposedly-approved translation.
        throw new Error(
          `fetch-blog: ${post.uuid} is approved for "${locale}" but ${file} is missing.`,
        );
      }
      reviewed.push(withCurrentGlobals(JSON.parse(readFileSync(file, "utf-8")), post));
    }
    localizePostTags(reviewed, locale, tagMap);
    writeFileSync(
      resolve(generatedDir, blogDataFilename(locale)),
      `${JSON.stringify(reviewed, null, 2)}\n`,
    );
    console.log(
      `✓ fetch-blog: ${reviewed.length} reviewed post(s) → src/generated/${blogDataFilename(locale)} (gated)`,
    );
  }

  // Auto locales (FR/IT/PT): translate at build time.
  const targets = published.filter((l) => AUTO_LOCALES.includes(l));
  if (posts.length === 0 || targets.length === 0 || !hasApiKey()) {
    if (posts.length > 0 && targets.length > 0 && !hasApiKey()) {
      console.log(
        "  fetch-blog: DEEPL_API_KEY not set — skipping auto blog translation (FR/IT/PT fall back to English).",
      );
    }
    return;
  }
  const cache = loadCache(cachePath);
  // REGEN_LOCALES=fr,it,pt drops those locales' cached blog strings so they are
  // re-translated + re-post-edited from scratch; other locales stay cache hits
  // (deterministic, no re-spend). Mirrors the flag in translate.mjs.
  for (const l of (process.env.REGEN_LOCALES ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    delete cache.translations[l];
  }
  const glossaryRegex = loadGlossary(glossaryPath);
  // Optional LLM post-edit pass (ANTHROPIC_API_KEY). Keyless → raw DeepL only.
  const postEditor = hasAnthropicKey()
    ? createPostEditor({ apiKey: process.env.ANTHROPIC_API_KEY.trim(), glossaryTerms: loadGlossaryTerms(glossaryPath) })
    : null;
  const translator = createTranslator({
    apiKey: process.env.DEEPL_API_KEY.trim(),
    glossaryRegex,
    cache,
    postEditor,
    cacheSalt: postEditor ? POSTEDIT_VERSION : "",
  });
  // A human-reviewed file (from scripts/review-translations.mjs) overrides the
  // machine translation for ANY locale when it's approved + hash-fresh; otherwise
  // the auto locale is machine-translated. (Un-reviewed today → identical output.)
  const approvals = loadApprovals(approvalsPath);
  for (const locale of targets) {
    const localized = [];
    let reviewed = 0;
    for (const post of posts) {
      const appr = approvals[post.uuid]?.[locale];
      const file = resolve(reviewedDir, `${post.uuid}.${locale}.json`);
      if (appr?.status === "approved" && appr.sourceHash === enSourceHash(post) && existsSync(file)) {
        localized.push(withCurrentGlobals(JSON.parse(readFileSync(file, "utf-8")), post));
        reviewed += 1;
      } else {
        localized.push((await translateStories([post], locale, translator))[0]);
      }
    }
    localizePostTags(localized, locale, tagMap);
    const localeFile = resolve(generatedDir, blogDataFilename(locale));
    writeFileSync(localeFile, `${JSON.stringify(localized, null, 2)}\n`);
    console.log(
      `✓ fetch-blog: ${localized.length} post(s) → src/generated/${blogDataFilename(locale)}` +
        `${reviewed ? ` (${reviewed} reviewed)` : ""}`,
    );
  }
  // DeepL quota fallback: if DeepL ran out mid-build, the strings above were
  // translated by Claude instead (no build failure) — surface it loudly.
  if (translator.stats.deeplExhausted) {
    const notice = await deeplQuotaNotice(process.env.DEEPL_API_KEY.trim());
    console.log(`::warning title=DeepL quota exhausted::${notice}`);
    console.warn(`⚠ fetch-blog: ${notice} (${translator.stats.claudeFromScratch} string(s) translated by Claude)`);
  }
  saveCache(cachePath, cache);
  if (postEditor) {
    const { postEdited, keptMt, failures } = postEditor.stats;
    console.log(
      `✓ fetch-blog: LLM post-edit — ${postEdited} refined, ${keptMt} kept as raw DeepL` +
        `${failures ? `, ${failures} call(s) failed` : ""}.`,
    );
  }
}

if (!token) {
  if (requireToken) {
    console.error(
      "fetch-blog: STORYBLOK_PUBLIC_TOKEN is not set but STORYBLOK_REQUIRE_TOKEN=1 " +
        "(deploy builds must provide the repo secret via deploy.yml build-env-vars).",
    );
    process.exit(1);
  }
  console.warn(
    "\n⚠ fetch-blog: STORYBLOK_PUBLIC_TOKEN not set — writing empty blog data.\n" +
      "  The blog will be EMPTY in this build (expected for PR CI and tokenless local builds).\n",
  );
  writeOutput([]);
  process.exit(0);
}

try {
  const posts = await fetchPublishedPosts({ token, version });

  if (posts.length === 0) {
    if (process.env.STORYBLOK_REQUIRE_POSTS === "1") {
      console.error(
        "fetch-blog: token is set but 0 posts were returned, and STORYBLOK_REQUIRE_POSTS=1.",
      );
      process.exit(1);
    }
    console.warn(
      "⚠ fetch-blog: token is set but 0 published posts found under blog/ — writing empty blog data.",
    );
  }

  // Bake each post's per-article approved-locale set (review gate) onto the
  // English data so prerender + generate-feeds emit routes / hreflang / sitemap
  // entries only for approved (or auto) pairs. See scripts/lib/blog-gate.mjs.
  const approvals = loadApprovals(approvalsPath);
  const publishedLocales = readPublishedLocales(localesTsPath);
  for (const post of posts) {
    post.approved_locales = approvedLocalesFor(post, approvals, publishedLocales, SOURCE_LOCALE);
  }

  writeOutput(posts);
  console.log(
    `✓ fetch-blog: ${posts.length} post(s) (version=${version}) → src/generated/blog-data.json`,
  );
  await translateBlog(posts);
} catch (err) {
  console.error(`fetch-blog: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

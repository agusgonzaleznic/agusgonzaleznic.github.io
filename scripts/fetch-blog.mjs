// Build-time Storyblok fetch. Runs before `vite build` (and before `vite` dev via
// predev) so src/generated/blog-data.json always exists when the app imports it.
//
// SECURITY: reads process.env.STORYBLOK_PUBLIC_TOKEN, never import.meta.env or a
// VITE_-prefixed var, so the token cannot reach the client bundle. The fetched
// content is public and safe to bake in.

import { writeFileSync, mkdirSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
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
import { cacheOnlyMode, reportTranslationBudget } from "./lib/i18n-budget.mjs";
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
const fixturePath = resolve(__dirname, "../content/fixtures/blog-fixture.json");

const token = process.env.STORYBLOK_PUBLIC_TOKEN;
// draft override is for local preview builds only (requires a preview token).
const version = process.env.STORYBLOK_VERSION === "draft" ? "draft" : "published";
// The PR CI workflow (reusable vite-ci.yml) cannot receive secrets, so a
// missing token only fails builds that opt in: deploy.yml sets
// STORYBLOK_REQUIRE_TOKEN=1 so production can never ship an empty blog by
// accident, while PR CI validates the empty-blog code path.
const requireToken = process.env.STORYBLOK_REQUIRE_TOKEN === "1";

// ---------------------------------------------------------------------------
// Client payload split.
//
// `body` is ~93% of every blog-data file (measured: 42,412 of 45,598 bytes for
// English). The /blog index renders PostCard -> PostMeta, and the only body
// consumer there is a word count for the reading estimate, so shipping six
// locales of full article richtext to open the index cost 64 KB brotli for one
// integer per post.
//
// blog-data.<locale>.json stays exactly as it was: prerender.mjs and
// generate-feeds.mjs read it and want the whole corpus. The two files below are
// what the CLIENT bundle globs (src/lib/blog.ts and src/lib/blog-body.ts), so
// the body only reaches the browser on an article route.
//   blog-index.<locale>.json   every field EXCEPT body, plus reading_minutes
//   blog-body.<locale>.json    { slug: body }
// ---------------------------------------------------------------------------

/** Concatenated plain text of a richtext subtree. Mirrors extractText in
 *  src/lib/blog.ts uses the same traversal and the same join, so the baked reading_minutes
 *  reproduces what readingTime() rendered before this split. */
function richtextText(node) {
  if (!node) return "";
  if (node.text) return node.text;
  if (!node.content?.length) return "";
  return node.content.map(richtextText).join(" ");
}

/** 200 wpm, minimum 1. Mirrors readingTime in src/lib/blog.ts. */
function readingMinutes(body) {
  const words = richtextText(body).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

const indexFilename = (locale) => (locale ? `blog-index.${locale}.json` : "blog-index.json");
const bodyFilename = (locale) => (locale ? `blog-body.${locale}.json` : "blog-body.json");

/** Write the client's index + body pair for `locale` (null = English source). */
function writeClientSplit(locale, posts) {
  mkdirSync(generatedDir, { recursive: true });
  const index = posts.map(({ body, ...rest }) => ({
    ...rest,
    reading_minutes: readingMinutes(body),
  }));
  const bodies = {};
  for (const p of posts) if (p.slug) bodies[p.slug] = p.body ?? null;
  writeFileSync(resolve(generatedDir, indexFilename(locale)), `${JSON.stringify(index, null, 2)}\n`);
  writeFileSync(resolve(generatedDir, bodyFilename(locale)), `${JSON.stringify(bodies, null, 2)}\n`);
}

function writeOutput(posts) {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(posts, null, 2)}\n`);
  writeClientSplit(null, posts);
}

/**
 * Delete per-locale blog data this run is not going to regenerate.
 *
 * src/generated is gitignored but NOT ephemeral outside CI, and nothing used to
 * clear it. A build that lost its Storyblok token (or DeepL) wrote an empty
 * English corpus and left the previous run's blog-data.<locale>.json in place,
 * so prerender emitted no article pages while the locale blog indexes still
 * listed every article and linked to them. 15 links to pages that no longer
 * existed, and the build stayed green. (The broken-link assertion in
 * prerender.mjs catches it now, but the data should never get into that state.)
 *
 * Called before writing, with the locales this run WILL write. Passing an empty
 * set therefore clears them all, which is exactly right for a tokenless build.
 */
function pruneLocaleData(keep) {
  if (!existsSync(generatedDir)) return;
  // All three families, or the split files become the stale-data bug this
  // function exists to prevent: a locale dropped from PUBLISHED_LOCALES would
  // keep a blog-index.<locale>.json the client still globs.
  const kept = new Set(
    [...keep].flatMap((l) => [blogDataFilename(l), indexFilename(l), bodyFilename(l)]),
  );
  const stale = readdirSync(generatedDir).filter(
    (f) => /^blog-(data|index|body)\.[a-z]{2}\.json$/.test(f) && !kept.has(f),
  );
  for (const f of stale) rmSync(resolve(generatedDir, f), { force: true });
  if (stale.length) {
    console.log(`✓ fetch-blog: cleared ${stale.length} stale locale file(s): ${stale.join(", ")}`);
  }
}

// Build-time localization of the blog, writing src/generated/blog-data.<locale>.json.
// Two policies (see scripts/lib/blog-gate.mjs), gated on PUBLISHED_LOCALES:
//   - Review-gated locales (DE/ES): served VERBATIM from committed reviewed
//     content (content/translations/<uuid>.<locale>.json) for approved+fresh
//     posts only. No translation, no API key needed, fully deterministic.
//   - Auto locales (FR/IT/PT): translated at build via DeepL (+ optional LLM
//     post-edit). KEYLESS → skipped, so those files fall back to English.
// English (blog-data.json) is written by writeOutput() before this runs; each
// post already carries its baked `approved_locales`.

// A reviewed translation file is a frozen snapshot: it holds the correct
// TRANSLATED text but its GLOBAL, non-translated fields (tags, cover image,
// dates, urls) are stale if the story changed after review. Always take those
// from the CURRENT English story so every locale, reviewed or auto, stays in
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
        "run the importer or edit content/tag-translations.json",
    );
  }
}

async function translateBlog(posts) {
  const published = readPublishedLocales(localesTsPath);
  const tagMap = loadTagMap(tagMapPath);
  const manifest = loadApprovals(approvalsPath);

  // Review-gated locales: assemble from committed reviewed content. A post is
  // included only when its approved_locales set contains the locale (approved +
  // hash-fresh); pending / held / stale variants are simply omitted.
  for (const locale of REVIEW_GATED_LOCALES) {
    if (!published.includes(locale)) continue;
    const reviewed = [];
    const demoted = [];
    for (const post of posts) {
      if (!post.approved_locales.includes(locale)) {
        // A locale the manifest still calls "approved", yet which did not make it
        // into approved_locales, means the stored sourceHash no longer matches the
        // English. That is the ONLY silent path out of this pipeline: the variant
        // is dropped from dist, from the sitemap and from every hreflang cluster,
        // and the loop below would still print a checkmark and exit 0. Say it out
        // loud, because the fix (re-review, or re-point the hash) needs a human.
        if (manifest[post.uuid]?.[locale]?.status === "approved") {
          demoted.push(post.uuid);
        }
        continue;
      }
      const file = resolve(reviewedDir, `${post.uuid}.${locale}.json`);
      if (!existsSync(file)) {
        // Approved in the manifest but the reviewed content is missing, so fail
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
    writeClientSplit(locale, reviewed);
    console.log(
      `✓ fetch-blog: ${reviewed.length} reviewed post(s) → src/generated/${blogDataFilename(locale)} (gated)`,
    );
    if (demoted.length) {
      console.log(
        `::warning title=Stale translation approval::${demoted.length} ${locale} article variant(s) ` +
          "were dropped because the stored sourceHash no longer matches the English",
      );
      console.warn(
        `  ⚠ fetch-blog: ${locale} is marked approved for ${demoted.length} post(s) whose stored\n` +
          "    sourceHash is stale, so those variants are NOT emitted (no page, no sitemap entry,\n" +
          "    no hreflang). Re-review them, or re-point the hash if only formatting changed:",
      );
      for (const uuid of demoted) console.warn(`      ${uuid}`);
    }
  }

  // Auto locales (FR/IT/PT): translate at build time.
  const targets = published.filter((l) => AUTO_LOCALES.includes(l));
  // Cache-only still has to walk every string, because answering them from the
  // committed cache is exactly what it is for. Taking the keyless early return
  // here would report zero misses and then render English.
  const cacheOnly = cacheOnlyMode();
  if (posts.length === 0 || targets.length === 0 || (!hasApiKey() && !cacheOnly)) {
    if (posts.length > 0 && targets.length > 0 && !hasApiKey()) {
      console.log(
        "  fetch-blog: DEEPL_API_KEY not set, skipping auto blog translation (FR/IT/PT fall back to English).",
      );
    }
    return;
  }
  if (cacheOnly) {
    console.log("  fetch-blog: cache-only, no paid translation call will be made.");
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
  const postEditor = hasAnthropicKey() && !cacheOnly
    ? createPostEditor({ apiKey: process.env.ANTHROPIC_API_KEY.trim(), glossaryTerms: loadGlossaryTerms(glossaryPath) })
    : null;
  const translator = createTranslator({
    apiKey: (process.env.DEEPL_API_KEY ?? "").trim(),
    glossaryRegex,
    cache,
    postEditor,
    // The committed cache was written by deploy builds, which always have
    // ANTHROPIC_API_KEY and so always salt with POSTEDIT_VERSION. A cache-only
    // run must use the SAME salt or every single string would miss.
    cacheSalt: postEditor || cacheOnly ? POSTEDIT_VERSION : "",
    cacheOnly,
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
    writeClientSplit(locale, localized);
    console.log(
      `✓ fetch-blog: ${localized.length} post(s) → src/generated/${blogDataFilename(locale)}` +
        `${reviewed ? ` (${reviewed} reviewed)` : ""}`,
    );
  }
  // DeepL quota fallback: if DeepL ran out mid-build, the strings above were
  // translated by Claude instead (no build failure), so surface it loudly.
  if (translator.stats.deeplExhausted) {
    const notice = await deeplQuotaNotice((process.env.DEEPL_API_KEY ?? "").trim());
    console.log(`::warning title=DeepL quota exhausted::${notice}`);
    console.warn(`⚠ fetch-blog: ${notice} (${translator.stats.claudeFromScratch} string(s) translated by Claude)`);
  }
  reportTranslationBudget("fetch-blog", translator.stats);
  if (!cacheOnly) saveCache(cachePath, cache);
  if (postEditor) {
    const { postEdited, keptMt, failures } = postEditor.stats;
    console.log(
      `✓ fetch-blog: LLM post-edit: ${postEdited} refined, ${keptMt} kept as raw DeepL` +
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
    // Note this check runs BEFORE the BLOG_FIXTURE branch below, so a deploy can
    // never fall back to fixture content: REQUIRE_TOKEN wins over FIXTURE.
    process.exit(1);
  }
  // BLOG_FIXTURE=1 swaps in a small committed corpus instead of an empty blog.
  //
  // PR CI cannot receive secrets, so every PR build used to render the site with
  // ZERO articles: 66 pages instead of 84. Nothing on a PR ever exercised an
  // article page, the per-article language switcher, an hreflang cluster, RSS
  // item content, or the assertion that no emitted page links to an unemitted
  // path. All of that was first exercised at deploy time, on main, after merge.
  //
  // A fixture buys that coverage without putting a secret anywhere near a PR
  // build, which matters: pasting a token into the reusable workflow's
  // build-env-vars is the exact path that once leaked a multiline secret into
  // public logs.
  //
  // The corpus deliberately contains shapes the real one does not: an article
  // approved in only two locales, and a syndicated article with an external
  // canonical. Those are the cases whose absence made the publication gate
  // untestable end-to-end.
  if (process.env.BLOG_FIXTURE === "1") {
    const { posts } = JSON.parse(readFileSync(fixturePath, "utf-8"));
    const publishedLocales = readPublishedLocales(localesTsPath);
    const published = new Set(publishedLocales);
    // Honour PUBLISHED_LOCALES even for fixtures: a fixture that emitted a
    // locale the site does not publish would produce pages prerender skips, and
    // the resulting "broken link" would be the fixture's fault, not a defect.
    for (const post of posts) {
      post.approved_locales = post.approved_locales.filter(
        (l) => l === SOURCE_LOCALE || published.has(l),
      );
    }
    const localesToWrite = [...new Set(posts.flatMap((p) => p.approved_locales))].filter(
      (l) => l !== SOURCE_LOCALE,
    );
    pruneLocaleData(localesToWrite);
    writeOutput(posts);
    // Per-locale copies, tagged so a fixture page is identifiable on sight. Only
    // posts approved for that locale, matching what the real pipeline writes.
    for (const locale of localesToWrite) {
      const localized = posts
        .filter((p) => p.approved_locales.includes(locale))
        .map((p) => ({ ...p, title: `[${locale}] ${p.title}` }));
      writeFileSync(
        resolve(generatedDir, blogDataFilename(locale)),
        `${JSON.stringify(localized, null, 2)}\n`,
      );
      writeClientSplit(locale, localized);
    }
    console.log(
      `✓ fetch-blog: FIXTURE corpus: ${posts.length} post(s), locales [${localesToWrite.join(", ")}].` +
        " No Storyblok token in this build; this is not real content.",
    );
    process.exit(0);
  }

  console.warn(
    "\n⚠ fetch-blog: STORYBLOK_PUBLIC_TOKEN not set, writing empty blog data.\n" +
      "  The blog will be EMPTY in this build (expected for tokenless local builds).\n",
  );
  pruneLocaleData([]);
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
      "⚠ fetch-blog: token is set but 0 published posts found under blog/, writing empty blog data.",
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

  // Drop locale data this run will not regenerate, e.g. a locale removed from
  // PUBLISHED_LOCALES, or one whose last approval was withdrawn. The union of
  // approved_locales is exactly what translateBlog is about to write.
  pruneLocaleData(
    [...new Set(posts.flatMap((p) => p.approved_locales))].filter((l) => l !== SOURCE_LOCALE),
  );
  writeOutput(posts);
  console.log(
    `✓ fetch-blog: ${posts.length} post(s) (version=${version}) → src/generated/blog-data.json`,
  );
  await translateBlog(posts);
} catch (err) {
  console.error(`fetch-blog: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

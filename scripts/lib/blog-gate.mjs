// Per-(article × locale) native-review gate for blog translations.
//
// PUBLISHED_LOCALES (src/i18n/locales.ts) is the coarse, site-wide switch. On
// top of it, blog ARTICLES have a fine gate:
//   - AUTO_LOCALES (DE/ES/FR/IT/PT since 2026-11-26): machine-translated at
//     build time (DeepL + LLM post-edit) and disclosed to readers as machine
//     translation. A post whose translation is approved in
//     content/i18n-approvals.json, with a sourceHash that still matches the
//     current English, is served verbatim from content/translations/ instead.
//     That file drops the disclosure only when its provenance is
//     "human-reviewed" (isHumanReviewed); "grandfathered-mt" and "auto-mt"
//     files are still machine translation and keep it. Review is optional and
//     can happen after publishing.
//   - REVIEW_GATED_LOCALES (none since 2026-11-26; DE/ES until then): a variant
//     is emitted ONLY when it is approved + hash-fresh, so editing the English
//     withholds a stale translation until it is re-reviewed. Kept so a locale
//     can be moved back without rebuilding the mechanism. Moving one back is
//     four edits, all pinned by blog-gate.test.mjs: add it here, and remove it
//     from AUTO_LOCALES, AUTO_LOCALE_MODE and AUTO_TRANSLATED_LOCALES
//     (src/i18n/locales.ts). Adding it here alone gates nothing, because the
//     auto list would still emit it.
//   - English is the source and always emits.
//
// fetch-blog.mjs bakes the resulting `approved_locales` onto each English post
// in blog-data.json; prerender.mjs + generate-feeds.mjs consume that array so
// routes, hreflang, and the sitemap only ever reference emitted (approved)
// pairs. This module is the single source of the policy + the hash.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

/**
 * Locales that require per-article native review before a variant is emitted.
 * Empty since 2026-11-26: DE/ES moved to AUTO_LOCALES at the owner's request,
 * so new posts ship in every language and review can follow.
 */
export const REVIEW_GATED_LOCALES = [];
/** Locales auto-translated at build time (disclosed as machine translation). */
export const AUTO_LOCALES = ["de", "es", "fr", "it", "pt"];

// Per-locale mode for the auto-translated locales. Flip any to "hold" to pull
// that locale's articles back to the English fallback (no /{locale}/ variant
// emitted, no hreflang/sitemap entry), e.g. if unreviewed machine translation
// is ever judged too risky for the brand. One-line change, no other edits.
// (Keep the "auto" set in sync with AUTO_TRANSLATED_LOCALES in src/i18n/locales.ts.)
export const AUTO_LOCALE_MODE = { de: "auto", es: "auto", fr: "auto", it: "auto", pt: "auto" };

// Richtext node types whose text is NOT translated: a translator never retypes a
// code sample, and richtext-translate skips these subtrees for that reason.
//
// They still have to reach the HASH, which is the opposite of what "opaque"
// suggests. A reviewed DE/ES body is served VERBATIM from content/translations/,
// so it carries whatever the code said at review time. Skipping code here meant
// that fixing a broken sample in the English article demoted nothing: the approval
// stayed fresh and the translated page kept shipping the OLD sample indefinitely,
// with no signal anywhere. Verified by mutation on the real corpus, where changing
// consumer_key to client_id inside the one code_block left the hash unchanged.
const OPAQUE_RICHTEXT = new Set(["code_block"]);

/** Every text string inside a subtree, translated or not, in document order. */
function collectRaw(node, acc) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) collectRaw(child, acc);
    return;
  }
  if (typeof node.text === "string" && node.text) acc.push(node.text);
  if (Array.isArray(node.content)) collectRaw(node.content, acc);
}

function collectText(node, acc) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, acc);
    return;
  }
  if (OPAQUE_RICHTEXT.has(node.type)) {
    // Not translated, but hashed: see the note on OPAQUE_RICHTEXT. Tagged so a
    // code edit can never be confused with a prose edit of the same text.
    const code = [];
    collectRaw(node, code);
    if (code.length) acc.push(`\u0000code:${code.join("\u0000")}`);
    return;
  }
  if (typeof node.text === "string" && node.text) acc.push(node.text);
  // Link TARGETS count as source, even though no translator retypes them.
  //
  // A reviewed DE/ES translation is served verbatim from content/translations/,
  // so it carries its own copy of the body, including hrefs. Retargeting a link
  // in the English article therefore changed nothing in the reviewed locales, and
  // because the hash ignored marks the approval still looked fresh: the German
  // page kept pointing at the OLD url indefinitely, with no signal anywhere.
  //
  // Hashing the href demotes the approval instead, which is the honest outcome:
  // somebody has to look at where the translated link now goes.
  for (const mark of node.marks ?? []) {
    if (mark?.attrs?.href) acc.push(`\u0000href:${mark.attrs.href}`);
  }
  if (Array.isArray(node.content)) collectText(node.content, acc);
}

/**
 * Stable short hash of an English post's translatable content (title, excerpt,
 * SEO fields, and body text). Changes iff the source a translator would read
 * changed, so a stale approval can be detected and demoted.
 */
export function enSourceHash(post) {
  const text = [];
  collectText(post.body, text);
  const canonical = [
    post.title ?? "",
    post.excerpt ?? "",
    post.seo_title ?? "",
    post.seo_description ?? "",
    text.join("␟"),
  ].join("␞");
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 24);
}

/** Read the approvals manifest.
 *
 * ABSENT is fine and means "nothing is approved yet": that is the intended
 * fail-safe and is how a fresh checkout behaves. A file that EXISTS but does not
 * parse is a different thing entirely and now throws.
 *
 * The old `catch { return {} }` conflated the two, and the failure was silent and
 * total: a truncated manifest made every reviewed locale variant look
 * unapproved, so prerender emitted no /de/ or /es/ pages, the sitemap and
 * hreflang sets lost them, and the build stayed GREEN. The same loader is used by
 * scripts/review-translations.mjs, where the consequence is worse: it would read
 * the manifest as empty and then write that back, permanently discarding every
 * approval on the next save. */
export function loadApprovals(path) {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `blog-gate: ${path} exists but is not valid JSON (${e.message}). ` +
        "Refusing to treat it as empty: that would silently unpublish every " +
        "reviewed translation. Restore it from git.",
      { cause: e },
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`blog-gate: ${path} must contain a JSON object, got ${Array.isArray(parsed) ? "an array" : typeof parsed}.`);
  }
  return parsed;
}

/**
 * Is this approval a person's translation, so the page may drop the
 * machine-translation notice? Only review-translations.mjs writes
 * "human-reviewed"; the manifest also holds "grandfathered-mt" (machine
 * translation live before the gate existed) and "auto-mt" entries, which are
 * approved for publishing but are still machine translation.
 */
export function isHumanReviewed(entry) {
  return entry?.provenance === "human-reviewed";
}

/**
 * Review-gated locales that are approved AND hash-fresh for this English post.
 * `gated` defaults to the shipped policy; tests pass a list so the mechanism
 * stays exercised while the shipped list is empty.
 */
export function approvedGatedLocales(post, approvals, gated = REVIEW_GATED_LOCALES) {
  const hash = enSourceHash(post);
  const entry = approvals[post.uuid] ?? {};
  return gated.filter((loc) => {
    const e = entry[loc];
    return e && e.status === "approved" && e.sourceHash === hash;
  });
}

/**
 * Does this post declare a canonical that points somewhere else entirely?
 *
 * Mirrors BlogPost.tsx exactly: only an `https://` override is honoured there
 * (an editor must not be able to aim canonical/og:url/JSON-LD @id at
 * javascript:/data:/http:). The two tests MUST agree; if this one were looser,
 * a malformed override the page ignores would silently suppress every
 * translation of that post.
 */
function hasExternalCanonical(post) {
  return /^https:\/\//.test(post?.canonical_override ?? "");
}

/**
 * The full ordered set of locales to emit for this English post, honoring the
 * coarse PUBLISHED_LOCALES switch: source always; auto locales if published;
 * gated locales only if approved+fresh AND published.
 *
 * A post with an external canonical_override (a syndicated piece whose original
 * lives elsewhere) is SOURCE-LOCALE ONLY. Emitting translations of it produced
 * six URLs that all declared the SAME foreign canonical (six pages disclaiming
 * themselves) wrapped in a six-way hreflang cluster. hreflang is only valid
 * between canonical pages, so the cluster was inert at best; the translations
 * could never rank, and they diluted the signal for the original. One page with
 * one honest canonical is the whole intent of setting an override.
 *
 * `policy` defaults to the shipped lists; tests pass their own.
 */
export function approvedLocalesFor(
  post,
  approvals,
  publishedLocales,
  sourceLocale = "en",
  { auto = AUTO_LOCALES, gated = REVIEW_GATED_LOCALES } = {},
) {
  const published = new Set(publishedLocales);
  const out = [sourceLocale];
  if (hasExternalCanonical(post)) return out;
  for (const loc of auto) {
    if (published.has(loc) && AUTO_LOCALE_MODE[loc] === "auto") out.push(loc);
  }
  for (const loc of approvedGatedLocales(post, approvals, gated)) if (published.has(loc)) out.push(loc);
  return [...new Set(out)];
}

// Per-(article × locale) native-review gate for blog translations.
//
// PUBLISHED_LOCALES (src/i18n/locales.ts) is the coarse, site-wide switch. On
// top of it, blog ARTICLES have a fine gate:
//   - DE/ES (REVIEW_GATED_LOCALES): a variant is emitted only when its
//     translation has been reviewed + approved in content/i18n-approvals.json
//     AND the stored sourceHash still matches the current English content
//     (editing the English auto-demotes a stale translation until re-reviewed).
//     Reviewed content is served verbatim from content/translations/ — the
//     build never re-translates it, so it is fully deterministic and needs no
//     API key.
//   - FR/IT/PT (AUTO_LOCALES): auto-translated at build time (DeepL + LLM
//     post-edit), disclosed to readers as machine translation.
//   - English is the source and always emits.
//
// fetch-blog.mjs bakes the resulting `approved_locales` onto each English post
// in blog-data.json; prerender.mjs + generate-feeds.mjs consume that array so
// routes, hreflang, and the sitemap only ever reference emitted (approved)
// pairs. This module is the single source of the policy + the hash.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

/** Locales that require per-article native review before a variant is emitted. */
export const REVIEW_GATED_LOCALES = ["de", "es"];
/** Locales auto-translated at build time (disclosed as machine translation). */
export const AUTO_LOCALES = ["fr", "it", "pt"];

// Per-locale mode for the auto-translated locales. Flip any to "hold" to pull
// that locale's articles back to the English fallback (no /{locale}/ variant
// emitted, no hreflang/sitemap entry) — e.g. if unreviewed machine translation
// is ever judged too risky for the brand. One-line change, no other edits.
// (Keep the "auto" set in sync with AUTO_TRANSLATED_LOCALES in src/i18n/locales.ts.)
export const AUTO_LOCALE_MODE = { fr: "auto", it: "auto", pt: "auto" };

// Richtext node types whose text is NOT translated (kept verbatim), so they
// must not contribute to the source hash either — matches richtext-translate.
const OPAQUE_RICHTEXT = new Set(["code_block"]);

function collectText(node, acc) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, acc);
    return;
  }
  if (OPAQUE_RICHTEXT.has(node.type)) return;
  if (typeof node.text === "string" && node.text) acc.push(node.text);
  if (Array.isArray(node.content)) collectText(node.content, acc);
}

/**
 * Stable short hash of an English post's translatable content (title, excerpt,
 * SEO fields, and body text). Changes iff the source a translator would read
 * changed — so a stale approval can be detected and demoted.
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
 * ABSENT is fine and means "nothing is approved yet" — that is the intended
 * fail-safe and is how a fresh checkout behaves. A file that EXISTS but does not
 * parse is a different thing entirely and now throws.
 *
 * The old `catch { return {} }` conflated the two, and the failure was silent and
 * total: a truncated manifest made every reviewed locale variant look
 * unapproved, so prerender emitted no /de/ or /es/ pages, the sitemap and
 * hreflang sets lost them, and the build stayed GREEN. The same loader is used by
 * scripts/review-translations.mjs, where the consequence is worse — it would read
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
        "Refusing to treat it as empty — that would silently unpublish every " +
        "reviewed translation. Restore it from git.",
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`blog-gate: ${path} must contain a JSON object, got ${Array.isArray(parsed) ? "an array" : typeof parsed}.`);
  }
  return parsed;
}

/** Review-gated locales that are approved AND hash-fresh for this English post. */
export function approvedGatedLocales(post, approvals) {
  const hash = enSourceHash(post);
  const entry = approvals[post.uuid] ?? {};
  return REVIEW_GATED_LOCALES.filter((loc) => {
    const e = entry[loc];
    return e && e.status === "approved" && e.sourceHash === hash;
  });
}

/**
 * Does this post declare a canonical that points somewhere else entirely?
 *
 * Mirrors BlogPost.tsx exactly: only an `https://` override is honoured there
 * (an editor must not be able to aim canonical/og:url/JSON-LD @id at
 * javascript:/data:/http:). The two tests MUST agree — if this one were looser,
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
 * six URLs that all declared the SAME foreign canonical — six pages disclaiming
 * themselves — wrapped in a six-way hreflang cluster. hreflang is only valid
 * between canonical pages, so the cluster was inert at best; the translations
 * could never rank, and they diluted the signal for the original. One page with
 * one honest canonical is the whole intent of setting an override.
 */
export function approvedLocalesFor(post, approvals, publishedLocales, sourceLocale = "en") {
  const published = new Set(publishedLocales);
  const out = [sourceLocale];
  if (hasExternalCanonical(post)) return out;
  for (const loc of AUTO_LOCALES) {
    if (published.has(loc) && AUTO_LOCALE_MODE[loc] === "auto") out.push(loc);
  }
  for (const loc of approvedGatedLocales(post, approvals)) if (published.has(loc)) out.push(loc);
  return [...new Set(out)];
}

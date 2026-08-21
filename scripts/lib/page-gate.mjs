// Per-(marketing-page × locale) review gate — the page analogue of blog-gate.mjs.
//
// Mirrors the blog gate EXACTLY, at whole-page granularity: a page's translatable
// copy hashes to a sourceHash; a locale is served VERBATIM from
// content/pages/<slug>.<locale>.json only when content/page-approvals.json marks
// it approved AND the stored sourceHash still matches the current English page.
// Editing any English copy changes the hash → the approval goes stale → the page
// falls back to machine translation until re-reviewed. Otherwise the page is
// machine-translated at build (today's behaviour), so this is fully backward-
// compatible: with no approvals/reviewed files, every page is MT'd exactly as now.
//
// Keyed by the page SLUG (stable + human-readable): the `pages/about` story → "about".
// This is the piece that stops the GitHub Actions DeepL+Claude pass from
// overwriting human-reviewed marketing-page copy (fetch-pages.mjs consults it
// BEFORE translating, just as fetch-blog.mjs does for articles).

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { collectTranslatableStrings } from "./page-translate.mjs";

/** `pages/about` (or `about`) → "about". Falls back to uuid if slugless. */
export function pageSlug(page) {
  const full = page.full_slug || page.slug || "";
  const s = String(full).replace(/^pages\//, "").replace(/\/+$/, "");
  return s || page.slug || page.uuid || "";
}

/**
 * Stable short hash of a page's translatable copy — uses the SAME extractor the
 * translator uses (page-translate.collectTranslatableStrings), so review-unit ==
 * translate-unit and the hash changes iff copy a reviewer would read changed.
 */
export function pageSourceHash(page) {
  const strings = collectTranslatableStrings(page); // de-duped, document order
  return createHash("sha256").update(strings.join("␞"), "utf8").digest("hex").slice(0, 24);
}

/** Read the page-approvals manifest.
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
export function loadPageApprovals(path) {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `page-gate: ${path} exists but is not valid JSON (${e.message}). ` +
        "Refusing to treat it as empty — that would silently unpublish every " +
        "reviewed translation. Restore it from git.",
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`page-gate: ${path} must contain a JSON object, got ${Array.isArray(parsed) ? "an array" : typeof parsed}.`);
  }
  return parsed;
}

/** Path to a reviewed page's per-locale store.
 *
 * Both `slug` and `locale` are interpolated into the filename, and `locale` can
 * originate from a request body in the local review tool — so a traversal value
 * would escape contentDir entirely. Callers validate, and this asserts, because
 * this builder is shared by the build (fetch-pages) and the review server and
 * only one of them had a guard. */
export function reviewedPagePath(contentDir, slug, locale) {
  // NOTE for future editors: comparing resolve(...) against join(...) does NOT
  // work as a containment check — join normalises `..` exactly like resolve, so
  // both sides collapse to the same escaped path and the comparison always
  // passes. Reject the dangerous characters in the INPUTS, then assert the file
  // lands directly in the base directory.
  for (const [name, v] of [["slug", slug], ["locale", locale]]) {
    if (typeof v !== "string" || /[/\\]/.test(v) || v.split(".").includes("..") || v === "..") {
      throw new Error(`refusing unsafe ${name}: ${JSON.stringify(v)}`);
    }
  }
  const base = resolve(contentDir);
  const p = resolve(base, `${slug}.${locale}.json`);
  if (dirname(p) !== base) {
    throw new Error(`refusing path outside ${base}: ${p}`);
  }
  return p;
}

/** Load a reviewed page tree, or null if absent. */
export function loadReviewedPage(contentDir, slug, locale) {
  const p = reviewedPagePath(contentDir, slug, locale);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}

/** True iff (page, locale) is approved AND hash-fresh against the current English page. */
export function isPageApproved(page, locale, approvals) {
  const e = approvals[pageSlug(page)]?.[locale];
  return !!(e && e.status === "approved" && e.sourceHash === pageSourceHash(page));
}

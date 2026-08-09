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
import { resolve } from "node:path";
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

/** Read the page-approvals manifest; missing/corrupt → empty (nothing approved). */
export function loadPageApprovals(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Path to a reviewed page's per-locale store. */
export function reviewedPagePath(contentDir, slug, locale) {
  return resolve(contentDir, `${slug}.${locale}.json`);
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

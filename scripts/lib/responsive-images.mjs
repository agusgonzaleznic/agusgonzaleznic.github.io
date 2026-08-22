// Emitted-HTML rule: a Storyblok image must ship responsive attributes.
//
// One fixed 1536px render was served to every viewport, and no width/height meant
// the LCP element had no aspect-ratio box, so its arrival shifted the article
// text. Both are invisible in review — the page looks right — so the rule lives
// here as a build assertion instead.
//
// Scoped to the BLOG subtree on purpose. The same defect exists in
// src/components/storyblok/{AboutBlock,TestimonialItem,HeroBlock}.tsx, which
// render `blok.image.filename` with no transform at all; widening the rule to
// every page without fixing those first would just fail the build.

/** Attribute tokens of one tag, matched individually.
 *
 *  Never match a whole tag shape: prerender re-serializes every page through
 *  beasties, so the quoting is the serializer's and not React's — React's
 *  `alt=""` comes out as a bare `alt`, and `srcSet` comes out lowercased as
 *  `srcset`. */
const hasAttr = (tag, name) => new RegExp(`\\s${name}(=|\\s|>|$)`, "i").test(tag);

const STORYBLOK_SRC = /\ssrc="[^"]*\/\/a\.storyblok\.com\/[^"]*"/i;
const SIZED_URL = /\/\/a\.storyblok\.com\/f\/\d+\/\d+x\d+\//i;

/**
 * @param {{path: string, html: string}[]} pages
 * @returns {string[]} human-readable violations, empty when clean
 */
export function findResponsiveImageViolations(pages) {
  const problems = [];
  for (const { path, html } of pages) {
    // Blog routes only: <locale>/blog/<slug>/ and the index.
    if (!/(^|\/)blog(\/|$)/.test(path)) continue;
    for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
      if (!STORYBLOK_SRC.test(tag)) continue;
      const missing = [];
      if (!hasAttr(tag, "srcset")) missing.push("srcset");
      if (!hasAttr(tag, "sizes")) missing.push("sizes");
      // width/height only when the URL states the intrinsic size — a guessed
      // aspect ratio is worse than none, so an unsized asset is exempt.
      if (SIZED_URL.test(tag)) {
        if (!hasAttr(tag, "width")) missing.push("width");
        if (!hasAttr(tag, "height")) missing.push("height");
      }
      if (missing.length) {
        problems.push(`${path}: <img> missing ${missing.join(", ")} — ${tag.slice(0, 110)}`);
      }
    }
  }
  return problems;
}

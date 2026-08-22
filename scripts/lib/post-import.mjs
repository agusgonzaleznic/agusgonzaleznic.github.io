// Pure helpers for the blog importer (scripts/new-post.mjs).
//
// They live here rather than in new-post.mjs because that file is a CLI that
// runs its work at import time — a test importing it would perform a real
// Storyblok round trip. These two functions decide whether an author's
// punctuation survives and whether re-importing a post destroys CMS-only fields,
// so both want direct tests.

/**
 * HTML entities worth decoding in prose.
 *
 * Only the XML-mandatory five plus nbsp were handled before, so an imported
 * article kept `&rsquo;` and `&mdash;` as literal text — visible in the
 * published post, in the excerpt, in the RSS description and in the machine
 * translation sent to DeepL.
 *
 * This is deliberately a curated list, not a full HTML5 entity table: an unknown
 * entity is left alone so it shows up as obviously wrong rather than being
 * silently mangled into the wrong character.
 */
export const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  // Written as escapes on purpose: every character here is invisible or
  // ambiguous in source. `&nbsp;` used to decode to a plain U+0020, so
  // "10&nbsp;km" became breakable and the typography quietly changed.
  nbsp: "\u00A0",
  // Quotes and dashes — the ones a word processor or CMS export emits.
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  sbquo: "‚", bdquo: "„", mdash: "—", ndash: "–",
  minus: "−", hellip: "…", prime: "′", Prime: "″",
  // Punctuation and symbols that show up in technical writing.
  laquo: "«", raquo: "»", lsaquo: "‹", rsaquo: "›",
  deg: "°", plusmn: "±", times: "×", divide: "÷",
  frac12: "½", sup2: "²", sup3: "³", micro: "µ",
  bull: "•", middot: "·", dagger: "†", sect: "§",
  para: "¶", copy: "©", reg: "®", trade: "™",
  euro: "€", pound: "£", yen: "¥", cent: "¢",
  larr: "←", rarr: "→", harr: "↔", darr: "↓", uarr: "↑",
  ne: "≠", le: "≤", ge: "≥", asymp: "≈", infin: "∞",
  shy: "\u00AD", ensp: "\u2002", emsp: "\u2003", thinsp: "\u2009",
};

/** Highest code point Unicode defines; String.fromCodePoint throws beyond it. */
const MAX_CODE_POINT = 0x10ffff;

/**
 * Decode the HTML entities in `s`, leaving anything unrecognised untouched.
 */
export function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, e) => {
    if (e[0] === "#") {
      const cp = /^#x/i.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      // Number.isFinite alone is not enough: it is true for 1e9, and
      // String.fromCodePoint(1e9) THROWS RangeError, which took down the whole
      // import on a single malformed entity. Range and integrality are what
      // fromCodePoint actually requires.
      if (!Number.isInteger(cp) || cp < 0 || cp > MAX_CODE_POINT) return whole;
      return String.fromCodePoint(cp);
    }
    return NAMED_ENTITIES[e] ?? whole;
  });
}

/** Content keys the importer builds from the source file. Everything else in the
 *  story belongs to whoever edited it in Storyblok. */
export const IMPORTER_KEYS = [
  "component",
  "title",
  "excerpt",
  "body",
  "published_date",
  "seo_title",
  "seo_description",
  "original_url",
  "canonical_override",
];

/**
 * Merge freshly imported content over what the story already holds.
 *
 * Re-importing used to PUT the built content object wholesale, which lost data
 * two different ways on the most ordinary operation there is — fixing a typo and
 * re-importing:
 *
 *   - `cover_image` is not a field the importer builds, so it was absent from
 *     the PUT and Storyblok dropped it.
 *   - `seo_title`, `seo_description`, `original_url` and `canonical_override`
 *     are built with `|| ""` defaults, so a source file that simply does not
 *     mention them overwrote real CMS-edited values with empty strings. Losing
 *     canonical_override also silently re-enables five locale variants of a
 *     syndicated post, because that field gates them.
 *
 * Empty frontmatter means "not specified", never "clear it" — clearing is done in
 * Storyblok. So a non-empty imported value wins, an empty one defers to what is
 * already there, and any key the importer does not manage is preserved as-is.
 */
export function mergeStoryContent(prior, next) {
  const isEmpty = (v) =>
    v === undefined ||
    v === null ||
    v === "" ||
    (Array.isArray(v) && v.length === 0);

  const out = { ...(prior ?? {}) };
  for (const key of IMPORTER_KEYS) {
    if (!(key in next)) continue;
    if (isEmpty(next[key]) && !isEmpty(out[key])) continue;
    out[key] = next[key];
  }
  return out;
}

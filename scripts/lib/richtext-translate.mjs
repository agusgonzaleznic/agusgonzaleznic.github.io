// Build-time translation of blog stories (Storyblok richtext + SEO fields).
//
// Consumed by scripts/fetch-blog.mjs after it fetches published stories. For a
// target locale it walks each story's ProseMirror/Storyblok richtext and
// translates ONLY text nodes, leaving structure, marks, link hrefs and every
// attr byte-identical. code_block content is never translated (source code must
// not be localized). The post's title / excerpt / seo_title / seo_description
// are translated too.
//
// FILENAME CONTRACT (coordinate with the app loader, src/lib/blog.ts, owned by
// i18n-core):
//   • English (source)   → src/generated/blog-data.json          (unchanged)
//   • Other locales      → src/generated/blog-data.<locale>.json
// Each <locale> file has the EXACT same JSON shape/order as blog-data.json, so
// the app can swap files by active locale and fall back to blog-data.json.
//
// Uses the same DeepL client + content-hash cache as scripts/translate.mjs. With
// no DEEPL_API_KEY the caller no-ops and only blog-data.json is written.

export const SOURCE_BLOG_FILE = "blog-data.json";

/** Per-locale generated blog data filename (relative to src/generated/). */
export function blogDataFilename(locale) {
  return `blog-data.${locale}.json`;
}

// Node types whose subtree must NOT be translated (source code stays verbatim).
const OPAQUE_NODE_TYPES = new Set(["code_block", "code"]);

/**
 * Collect every translatable text node string in document order. Skips empty
 * strings and anything inside an OPAQUE_NODE_TYPES subtree. Returns the strings
 * plus the node references, so translations can be written straight back.
 */
function collectTextNodes(node, acc) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) collectTextNodes(child, acc);
    return;
  }
  if (OPAQUE_NODE_TYPES.has(node.type)) return; // do not descend into code
  if (node.type === "text" && typeof node.text === "string" && node.text.trim()) {
    acc.push(node);
  }
  if (Array.isArray(node.content)) collectTextNodes(node.content, acc);
}

/**
 * Translate one story object in place-free fashion (returns a new object). The
 * `translator` is a createTranslator() instance; `locale` an app locale.
 */
export async function translateStory(story, locale, translator) {
  // Deep clone so the English source object is never mutated.
  const copy = structuredClone(story);

  // 1. Richtext text nodes (skipping code) — batch them through one call.
  const textNodes = [];
  collectTextNodes(copy.body, textNodes);
  if (textNodes.length) {
    const out = await translator.translateAll(textNodes.map((n) => n.text), locale);
    textNodes.forEach((n, i) => {
      n.text = out[i];
    });
  }

  // 2. Plain string fields (title, excerpt, SEO). cover_image alt/title and
  //    other attrs are intentionally left as-is per the text-node-only contract.
  const stringFields = ["title", "excerpt", "seo_title", "seo_description"];
  const values = stringFields.map((f) => (typeof copy[f] === "string" ? copy[f] : ""));
  const translatedValues = await translator.translateAll(values, locale);
  stringFields.forEach((f, i) => {
    if (typeof copy[f] === "string" && copy[f].trim()) copy[f] = translatedValues[i];
  });

  return copy;
}

/** Translate an array of stories for one locale. */
export async function translateStories(stories, locale, translator) {
  const out = [];
  for (const story of stories) out.push(await translateStory(story, locale, translator));
  return out;
}

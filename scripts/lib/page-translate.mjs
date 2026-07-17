// Build-time translation of marketing PAGE stories — the structured analog of
// scripts/lib/richtext-translate.mjs. Consumed by scripts/fetch-pages.mjs.
//
// A page is a tree of blocks with plain-string fields. This walker translates
// EVERY string field EXCEPT those whose key is structural/non-text (NON_TEXT
// below) — so icons, colors, `featured`, stat `value` like "40%", `period`,
// `company` names, the untranslated `industries` list, URLs, slugs, and
// component/_uid stay byte-identical, while all copy is translated. Uses the
// same DeepL client + content-hash cache as the blog (translator.translateAll).
//
// FILENAME CONTRACT (coordinate with src/lib/pages.ts):
//   • English (source) → src/generated/page-data.json
//   • Other locales    → src/generated/page-data.<locale>.json  (same shape/order)

export const SOURCE_PAGE_FILE = "page-data.json";

/** Per-locale generated page data filename (relative to src/generated/). */
export function pageDataFilename(locale) {
  return `page-data.${locale}.json`;
}

// Field NAMES that are NOT translatable copy (denylist). Everything else that is
// a non-empty string gets translated. A denylist (not an allowlist) means a new
// copy field is translated by default; only structural fields must be listed.
const NON_TEXT_FIELDS = new Set([
  "component", "_uid", "_editable", "slug", "full_slug", "uuid", "id",
  "icon", "color", "value", "period", "company", "featured", "is_highlighted",
  "show_section", "background_style", "industries",
  "url", "cta_url", "secondary_cta_url", "href", "image", "og_image", "filename",
]);

/** Collect writable slots ({ obj, key }) for every translatable string, in order. */
function collect(node, acc) {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, acc);
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "string") {
      if (value.trim() && !NON_TEXT_FIELDS.has(key)) acc.push({ obj: node, key });
    } else if (value && typeof value === "object") {
      collect(value, acc);
    }
  }
}

/**
 * Every translatable string in a page, in document order. Exported so the
 * seed/cache-prime uses the SAME set the translator does (prime-set == translate-set,
 * no drift). De-duplicated.
 */
export function collectTranslatableStrings(page) {
  const acc = [];
  collect(page, acc);
  return [...new Set(acc.map((s) => s.obj[s.key]))];
}

/** Translate one page object (returns a new object; source is never mutated). */
export async function translatePage(page, locale, translator) {
  const copy = structuredClone(page);
  const slots = [];
  collect(copy, slots);
  if (slots.length) {
    const out = await translator.translateAll(
      slots.map((s) => s.obj[s.key]),
      locale,
    );
    slots.forEach((s, i) => {
      s.obj[s.key] = out[i];
    });
  }
  return copy;
}

/** Translate an array of pages for one locale. */
export async function translatePages(pages, locale, translator) {
  const out = [];
  for (const page of pages) out.push(await translatePage(page, locale, translator));
  return out;
}

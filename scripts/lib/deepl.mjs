// Shared build-time DeepL client for the i18n pipeline.
//
// Used by scripts/translate.mjs (Lingui PO catalogs) and
// scripts/lib/richtext-translate.mjs (blog richtext + SEO fields). Pure Node,
// zero runtime deps, no side effects on import.
//
// SECURITY: the key is read only from process.env.DEEPL_API_KEY (a NON-VITE,
// build-time-only var). It is never logged and never reaches src/ or the client
// bundle. This repo is public — keep it that way.
//
// KEYLESS: with no key set, hasApiKey() is false and callers must no-op. The
// pipeline is complete but a keyless run leaves catalogs untranslated (English
// only), which is the safe default for this phase.
//
// DO-NOT-TRANSLATE / PLACEHOLDER SAFETY: before a string is sent to DeepL, every
// protected span — ICU/interpolation placeholders ({name}, {count, plural, …}),
// Lingui/HTML component tags (<0>, </0>, <1/>, <strong>), URLs, emails, and the
// glossary terms in scripts/i18n-glossary.json — is masked into an XML <x>N</x>
// sentinel and DeepL is called with tag_handling=xml & ignore_tags=x, so DeepL
// preserves those tags verbatim. The sentinels are swapped back afterwards. This
// keeps ICU/markup and brand/proper nouns byte-identical through translation.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

export const SOURCE_LOCALE = "en";
// Mirror of ALL_LOCALES minus SOURCE_LOCALE in src/i18n/locales.ts (fixed by the
// project's i18n DECISIONS: en + de, es, fr, it, pt). Kept as plain data here so
// the build scripts don't need to compile the TS config.
export const TARGET_LOCALES = ["de", "es", "fr", "it", "pt"];

// App locale → DeepL target_lang. PT defaults to European Portuguese; change to
// "PT-BR" here if Brazilian Portuguese is preferred.
const DEEPL_TARGET = { de: "DE", es: "ES", fr: "FR", it: "IT", pt: "PT-PT" };
// Targets that support the formality parameter — all five use prefer_more so the
// translated copy stays in the same professional register as the English source.
const FORMALITY_LOCALES = new Set(["de", "es", "fr", "it", "pt"]);

const CACHE_VERSION = 1;
const BATCH_SIZE = 45; // DeepL allows up to 50 text params per request.

export function resolveApiKey() {
  return (process.env.DEEPL_API_KEY ?? "").trim();
}

export function hasApiKey() {
  return resolveApiKey().length > 0;
}

function hashSource(text) {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 24);
}

// ---- Content-hash cache (scripts/.i18n-cache.json, committed) ---------------
// Keyed by (source-hash + locale): an unchanged English string is never
// re-translated, and a changed English string produces a new hash that misses
// the cache, so it is flagged for (re)translation. Shared across PO catalogs and
// blog richtext — identical English yields one cache entry regardless of source.

export function loadCache(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (parsed && typeof parsed === "object" && parsed.translations) {
      return { version: CACHE_VERSION, translations: parsed.translations };
    }
  } catch {
    // Missing/corrupt cache → start fresh.
  }
  return { version: CACHE_VERSION, translations: {} };
}

export function saveCache(path, cache) {
  // Stable, sorted output so the committed cache diffs cleanly.
  const translations = {};
  for (const locale of Object.keys(cache.translations).sort()) {
    const byHash = cache.translations[locale];
    const sorted = {};
    for (const h of Object.keys(byHash).sort()) sorted[h] = byHash[h];
    translations[locale] = sorted;
  }
  writeFileSync(path, `${JSON.stringify({ version: CACHE_VERSION, translations }, null, 2)}\n`);
}

/** Seed a cached translation (e.g. adopting a reviewed/edited catalog string). */
export function seedCache(cache, locale, source, translation) {
  (cache.translations[locale] ??= {})[hashSource(source)] = translation;
}

// ---- Glossary + masking -----------------------------------------------------

export function loadGlossary(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    const terms = Array.isArray(parsed?.terms) ? parsed.terms.filter((t) => typeof t === "string") : [];
    return buildGlossaryRegex(terms);
  } catch {
    return null;
  }
}

function buildGlossaryRegex(terms) {
  if (!terms.length) return null;
  // Longest-first so multi-word terms win over their substrings.
  const escaped = [...terms]
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // Case-sensitive, bounded so we don't clip inside a larger word.
  return new RegExp(`(?<![A-Za-z0-9])(?:${escaped.join("|")})(?![A-Za-z0-9])`, "g");
}

const xmlEscape = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const xmlUnescape = (s) =>
  s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");

// Balanced { … } ranges (ICU messages, nested plural/select bodies included).
function braceRanges(text) {
  const ranges = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (c === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0) ranges.push([start, i + 1]);
    }
  }
  return ranges;
}

// Replace every protected span with an <x>N</x> sentinel; return the XML payload
// plus the ordered originals to restore afterwards.
function protect(text, glossaryRegex) {
  const ranges = [];
  const push = (re) => {
    for (const m of text.matchAll(re)) ranges.push([m.index, m.index + m[0].length]);
  };
  push(/<[^>]+>/g); // tags: <0> </0> <1/> <strong> …
  for (const r of braceRanges(text)) ranges.push(r); // ICU / interpolation
  push(/\bhttps?:\/\/[^\s<>{}"']+/g); // URLs
  push(/\bwww\.[^\s<>{}"']+/g);
  push(/[^\s<>{}"'()@]+@[^\s<>{}"'()@]+\.[A-Za-z]{2,}/g); // emails
  if (glossaryRegex) push(glossaryRegex);

  // Earliest start wins; on a tie the longest span wins. Then keep only
  // non-overlapping spans left-to-right.
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const kept = [];
  let last = -1;
  for (const [s, e] of ranges) {
    if (s >= last) {
      kept.push([s, e]);
      last = e;
    }
  }

  const originals = [];
  let out = "";
  let pos = 0;
  for (const [s, e] of kept) {
    out += xmlEscape(text.slice(pos, s));
    out += `<x>${originals.push(text.slice(s, e)) - 1}</x>`;
    pos = e;
  }
  out += xmlEscape(text.slice(pos));
  return { payload: out, originals };
}

function restore(translated, originals) {
  return xmlUnescape(translated).replace(/<x>\s*(\d+)\s*<\/x>/g, (_, d) => originals[Number(d)] ?? "");
}

// ---- Translator -------------------------------------------------------------

async function callDeepL(apiKey, texts, targetLang, formality) {
  // Free keys end in ":fx" → api-free host; paid keys → api.deepl.com.
  const host = apiKey.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
  const body = new URLSearchParams();
  for (const t of texts) body.append("text", t);
  body.set("source_lang", "EN");
  body.set("target_lang", targetLang);
  body.set("tag_handling", "xml");
  body.set("ignore_tags", "x");
  if (formality) body.set("formality", formality);

  const res = await fetch(`${host}/v2/translate`, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    // Never echo the request/headers — they carry the key.
    const detail = await res.text().catch(() => "");
    throw new Error(`DeepL API ${res.status} ${res.statusText}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  const json = await res.json();
  return json.translations.map((t) => t.text);
}

/**
 * Create a translator bound to a key, glossary, and (shared, mutated) cache.
 * translateAll() is cache-first and batched; only genuinely new/changed English
 * hits the network.
 */
export function createTranslator({ apiKey, glossaryRegex, cache }) {
  const stats = { cacheHits: 0, translated: 0, apiCalls: 0 };

  async function translateAll(texts, locale) {
    const target = DEEPL_TARGET[locale];
    if (!target) throw new Error(`Unsupported target locale: ${locale}`);
    const store = (cache.translations[locale] ??= {});
    const formality = FORMALITY_LOCALES.has(locale) ? "prefer_more" : undefined;

    // Resolve from cache; collect the unique, non-empty misses.
    const results = new Array(texts.length);
    const missByHash = new Map(); // hash → { source, payload, originals }
    texts.forEach((source, i) => {
      if (!source || !source.trim()) {
        results[i] = source;
        return;
      }
      const h = hashSource(source);
      if (h in store) {
        results[i] = store[h];
        stats.cacheHits += 1;
        return;
      }
      if (!missByHash.has(h)) {
        const { payload, originals } = protect(source, glossaryRegex);
        missByHash.set(h, { source, payload, originals });
      }
    });

    // Translate misses in batches.
    const misses = [...missByHash.entries()];
    for (let i = 0; i < misses.length; i += BATCH_SIZE) {
      const chunk = misses.slice(i, i + BATCH_SIZE);
      const out = await callDeepL(apiKey, chunk.map(([, v]) => v.payload), target, formality);
      stats.apiCalls += 1;
      chunk.forEach(([h, v], j) => {
        store[h] = restore(out[j] ?? "", v.originals);
        stats.translated += 1;
      });
    }

    // Fill the misses back into their positions.
    texts.forEach((source, i) => {
      if (results[i] === undefined) results[i] = store[hashSource(source)] ?? source;
    });
    return results;
  }

  return {
    stats,
    translateAll,
    /** Single-string convenience wrapper. */
    async translate(text, locale) {
      return (await translateAll([text], locale))[0];
    },
  };
}

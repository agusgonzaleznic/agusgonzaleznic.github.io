// Shared build-time DeepL client for the i18n pipeline.
//
// Used by scripts/translate.mjs (Lingui PO catalogs) and
// scripts/lib/richtext-translate.mjs (blog richtext + SEO fields). Pure Node,
// zero runtime deps, no side effects on import.
//
// SECURITY: the key is read only from process.env.DEEPL_API_KEY (a NON-VITE,
// build-time-only var). It is never logged and never reaches src/ or the client
// bundle. This repo is public, so keep it that way.
//
// KEYLESS: with no key set, hasApiKey() is false and callers must no-op. The
// pipeline is complete but a keyless run leaves catalogs untranslated (English
// only), which is the safe default for this phase.
//
// DO-NOT-TRANSLATE / PLACEHOLDER SAFETY: before a string is sent to DeepL, every
// protected span (ICU/interpolation placeholders ({name}, {count, plural, …}),
// Lingui/HTML component tags (<0>, </0>, <1/>, <strong>), URLs, emails, and the
// glossary terms in scripts/i18n-glossary.json) is masked into an XML <x>N</x>
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
// Targets that support the formality parameter. All five ask for prefer_LESS,
// because this site addresses the reader informally in every language: German du,
// Argentine voseo, and tu in French, Italian and Portuguese. The catalogs are
// unambiguous about it (de.po carries 75 informal-pronoun hits against a single
// Sie, which is not even an address; fr.po has 71 tu/ton/te and no vous).
//
// This used to ask for prefer_more, rationalised as keeping "the same
// professional register as the English source". That conflated professional with
// formal, which are different things: the English source is professional AND
// informal. The practical consequence was that the documented fail-safe, "a
// degraded run is merely raw DeepL", degraded into the WRONG REGISTER rather than
// a rougher one, so a keyless-Claude run could ship a Sie-form headline into a
// page whose other strings all address the reader as du.
const FORMALITY_LOCALES = new Set(["de", "es", "fr", "it", "pt"]);

const CACHE_VERSION = 1;
const BATCH_SIZE = 45; // DeepL allows up to 50 text params per request.

export function resolveApiKey() {
  return (process.env.DEEPL_API_KEY ?? "").trim();
}

export function hasApiKey() {
  return resolveApiKey().length > 0;
}

// The optional salt namespaces the cache: raw-DeepL entries (salt "") and
// LLM-post-edited entries (salt = POSTEDIT_VERSION) live at different keys for the
// same source, so enabling the post-edit key regenerates post-edited output
// automatically without a keyless build ever seeing (or needing to discard) it.
// salt "" is byte-identical to the original single-arg behaviour.
function hashSource(text, salt = "") {
  const h = createHash("sha256").update(text, "utf8");
  // Domain separator so hash(text, salt) cannot collide with a different
  // text/salt split. Written as the ESCAPE, not a literal NUL byte: a raw
  // 0x00 in the source makes git classify this file as BINARY, which hides
  // every diff in it from review. The digest is byte-identical either way
  // (verified), so the committed translation cache stays valid.
  if (salt) h.update(`\u0000${salt}`);
  return h.digest("hex").slice(0, 24);
}

// ---- Content-hash cache (scripts/.i18n-cache.json, committed) ---------------
// Keyed by (source-hash + locale): an unchanged English string is never
// re-translated, and a changed English string produces a new hash that misses
// the cache, so it is flagged for (re)translation. Shared across PO catalogs and
// blog richtext: identical English yields one cache entry regardless of source.

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

export const EM_DASH = "\u2014";

/**
 * Normalise an em dash that a translator invented and the English did not have.
 *
 * German and Spanish take it as the Gedankenstrich / raya, an EN dash, which is
 * typographically correct in both. French, Italian and Portuguese have no safe
 * mechanical rewrite, so the string comes back unchanged and flagged: the caller
 * reports it rather than silently shipping a character the house style forbids.
 */
export function normaliseDash(text, locale) {
  if (typeof text !== "string" || !text.includes(EM_DASH)) return { text, violation: false };
  if (locale === "de" || locale === "es") {
    return { text: text.split(EM_DASH).join("\u2013"), violation: false };
  }
  return { text, violation: true };
}

/**
 * Seed a cached translation (e.g. adopting a reviewed/edited catalog string).
 * Pass the translator's cacheSalt so reviewed strings are adopted at the same key
 * the active pipeline looks up, so they hit the cache and skip both DeepL and
 * the LLM post-edit.
 */
export function seedCache(cache, locale, source, translation, salt = "") {
  (cache.translations[locale] ??= {})[hashSource(source, salt)] = translation;
}

/**
 * Read a cached translation, or undefined. Same key derivation as seedCache, so a
 * caller can ask "is this already cached?" without reimplementing the hash.
 */
export function cachedTranslation(cache, locale, source, salt = "") {
  return (cache.translations[locale] ?? {})[hashSource(source, salt)];
}

// ---- Glossary + masking -----------------------------------------------------

export function loadGlossaryTerms(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(parsed?.terms) ? parsed.terms.filter((t) => typeof t === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Read PUBLISHED_LOCALES straight from src/i18n/locales.ts at build time.
 *
 * The build must NOT translate/post-edit locales it doesn't ship, because prerender
 * emits only PUBLISHED_LOCALES, so translating the rest is pure cost (this is
 * what turned one deploy into an 8-minute run: 5 locales, none published).
 * fetch-blog runs BEFORE the TS is compiled, so it can't import the module; and
 * PUBLISHED_LOCALES changes on every release, so mirroring it as a second
 * constant here would be a desync hazard. Parsing the source keeps locales.ts
 * the single source of truth, so publishing a locale stays a one-line edit there.
 * Throws (fails the build) if the array can't be parsed, rather than silently
 * translating nothing.
 */
export function readPublishedLocales(localesTsPath) {
  const src = readFileSync(localesTsPath, "utf8");
  const m = src.match(/PUBLISHED_LOCALES[^=]*=\s*\[([^\]]*)\]/);
  if (!m) throw new Error(`Could not parse PUBLISHED_LOCALES from ${localesTsPath}`);
  return [...m[1].matchAll(/["']([a-z-]+)["']/g)].map((x) => x[1]);
}

export function loadGlossary(path) {
  return buildGlossaryRegex(loadGlossaryTerms(path));
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
//
// Exported for tests. These two functions decide whether an ICU placeholder, a
// component tag or a URL survives a round trip through a machine translator, and
// a bug in either corrupts every translated string in the catalog, so direct tests
// are worth more here than keeping the pair private.
export function protect(text, glossaryRegex) {
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

export function restore(translated, originals) {
  return xmlUnescape(translated).replace(/<x>\s*(\d+)\s*<\/x>/g, (_, d) => originals[Number(d)] ?? "");
}

/**
 * Refuse to trade a real translation for the English source.
 *
 * Given the sources, the freshly produced translations, and whatever the catalog
 * already held (keyed the same way), return translations with every REGRESSION
 * reverted: a fresh output byte-identical to its source, where the previous
 * value existed and DIFFERED, is replaced by the previous value.
 *
 * A translation that was already identical to its source stays identical, and many
 * legitimately are ("Coaching", "Leadership", brand names), so this only ever
 * blocks a regression, never a first translation.
 *
 * The concrete case: protect() masks an ICU plural as ONE sentinel, because the
 * outermost balanced brace range spans the whole message including its
 * sub-messages. A from-scratch run therefore returns the plural unchanged, and
 * REGEN_LOCALES skips catalog adoption, so the documented "re-post-edit one
 * locale" command would silently revert every plural to English.
 *
 * @returns {{ translations: string[], keptIds: string[] }}
 */
export function keepExistingWhenUnchanged({ keys, sources, translations, previous }) {
  const out = [...translations];
  const keptIds = [];
  for (let i = 0; i < out.length; i += 1) {
    if (out[i] !== sources[i]) continue;
    const prev = previous.get(keys[i]);
    if (prev && prev !== sources[i]) {
      out[i] = prev;
      keptIds.push(keys[i]);
    }
  }
  return { translations: out, keptIds };
}

// ---- Translator -------------------------------------------------------------

function deeplHost(apiKey) {
  // Free keys end in ":fx" → api-free host; paid keys → api.deepl.com.
  return apiKey.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
}

/** Current billing-period usage { count, limit }, or null if unreadable. Never throws. */
export async function fetchDeeplUsage(apiKey) {
  try {
    const res = await fetch(`${deeplHost(apiKey)}/v2/usage`, {
      headers: { Authorization: `DeepL-Auth-Key ${apiKey}` },
    });
    if (!res.ok) return null;
    const j = await res.json();
    return typeof j?.character_count === "number" && typeof j?.character_limit === "number"
      ? { count: j.character_count, limit: j.character_limit }
      : null;
  } catch {
    return null;
  }
}

// DeepL's API does not expose the quota reset date, so it's opt-in via the
// DEEPL_QUOTA_RESET_DAY env / repo variable (day-of-month 1–28, from your DeepL
// account). Returns the next occurrence as YYYY-MM-DD, or null when unset.
export function nextQuotaReset(resetDay, now = new Date()) {
  const day = Number(resetDay);
  if (!Number.isInteger(day) || day < 1 || day > 28) return null;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
  if (d <= now) d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

/** Human-readable DeepL-quota notice for the build log / CI annotation. Never throws. */
export async function deeplQuotaNotice(apiKey) {
  const usage = await fetchDeeplUsage(apiKey);
  const reset = nextQuotaReset(process.env.DEEPL_QUOTA_RESET_DAY);
  const parts = [
    "DeepL character quota exhausted (HTTP 456). The build fell back to Claude-only translation, so the site still builds and every locale stays translated.",
  ];
  if (usage) {
    parts.push(
      `DeepL usage this period: ${usage.count.toLocaleString("en-US")} / ${usage.limit.toLocaleString("en-US")} characters.`,
    );
  }
  parts.push(
    reset
      ? `Quota renews on ${reset} (from DEEPL_QUOTA_RESET_DAY).`
      : "Quota renews monthly. Set the DEEPL_QUOTA_RESET_DAY repo variable to your DeepL account's reset day to show the exact date here.",
  );
  return parts.join(" ");
}

async function callDeepL(apiKey, texts, targetLang, formality) {
  const host = deeplHost(apiKey);
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
    // Never echo the request/headers, they carry the key.
    const detail = await res.text().catch(() => "");
    const err = new Error(`DeepL API ${res.status} ${res.statusText}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
    err.deeplStatus = res.status; // lets callers detect quota (456) and fall back
    throw err;
  }
  const json = await res.json();
  return json.translations.map((t) => t.text);
}

/**
 * Create a translator bound to a key, glossary, and (shared, mutated) cache.
 * translateAll() is cache-first and batched; only genuinely new/changed English
 * hits the network.
 */
export function createTranslator({
  apiKey,
  glossaryRegex,
  cache,
  postEditor = null,
  cacheSalt = "",
  // Cache-only: answer every string from the committed cache and never call a
  // paid API. This is what the deploy gate runs to decide whether anything
  // actually needs translating, and what a build runs when translation is off.
  cacheOnly = false,
  // Whether a result produced WITHOUT the post-edit pass may be written to the
  // committed cache. Pages set this false: their salt deliberately does not
  // include POSTEDIT_VERSION, so a raw-DeepL result occupies the same key as the
  // post-edited one and, because a hit is never re-edited, would pin raw MT there
  // permanently. Such a result is still used for the current run.
  persistWithoutPostEdit = true,
}) {
  const stats = {
    cacheHits: 0,
    translated: 0,
    apiCalls: 0,
    deeplExhausted: false,
    claudeFromScratch: 0,
    // Every (locale, source) the cache could not answer.
    missing: [],
    // Misses that finished the run with no translation behind them.
    untranslated: [],
    // Translations carrying an em dash the English did not have.
    dashViolations: [],
    // Results used for this run but deliberately not written to the cache.
    unpersisted: [],
  };
  // Once DeepL returns a quota error (HTTP 456), stop calling it for the rest of
  // the run and translate the remaining misses with Claude only (see below).
  let deeplExhausted = false;

  async function translateAll(texts, locale) {
    const target = DEEPL_TARGET[locale];
    if (!target) throw new Error(`Unsupported target locale: ${locale}`);
    const store = (cache.translations[locale] ??= {});
    // Results this run may use but must not commit (see persistWithoutPostEdit).
    // Discarded when the run ends.
    const ephemeral = new Map();
    const persist = postEditor !== null || persistWithoutPostEdit;
    const keep = (h, source, text) => {
      if (persist) {
        store[h] = text;
        return;
      }
      ephemeral.set(h, text);
      stats.unpersisted.push({ locale, source });
    };
    const formality = FORMALITY_LOCALES.has(locale) ? "prefer_less" : undefined;

    // Resolve from cache; collect the unique, non-empty misses.
    const results = new Array(texts.length);
    const missByHash = new Map(); // hash → { source, payload, originals }
    texts.forEach((source, i) => {
      if (!source || !source.trim()) {
        results[i] = source;
        return;
      }
      const h = hashSource(source, cacheSalt);
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

    // Translate misses in batches (raw DeepL). On a DeepL QUOTA error (HTTP 456)
    // stop calling DeepL for the rest of the run and leave the remaining misses
    // for the Claude fallback below (their store[h] stays undefined). Any OTHER
    // DeepL error still throws → the build fails loudly (don't mask misconfig).
    const misses = [...missByHash.entries()];
    for (const [, v] of misses) stats.missing.push({ locale, source: v.source });

    if (cacheOnly) {
      // Return the English for anything the cache did not have, and write
      // NOTHING: a cache entry is a permanent hit, so caching the source here
      // would freeze this string to English in this locale for good.
      texts.forEach((source, i) => {
        if (results[i] === undefined) results[i] = source;
      });
      return results;
    }

    for (let i = 0; i < misses.length && !deeplExhausted; i += BATCH_SIZE) {
      const chunk = misses.slice(i, i + BATCH_SIZE);
      let out;
      try {
        out = await callDeepL(apiKey, chunk.map(([, v]) => v.payload), target, formality);
      } catch (err) {
        if (err?.deeplStatus === 456) {
          deeplExhausted = true;
          stats.deeplExhausted = true;
          break;
        }
        throw err;
      }
      stats.apiCalls += 1;
      chunk.forEach(([h, v], j) => {
        const { text, violation } = normaliseDash(restore(out[j] ?? "", v.originals), locale);
        if (violation) stats.dashViolations.push({ locale, source: v.source, translation: text });
        keep(h, v.source, text);
        stats.translated += 1;
      });
    }

    // Second pass: LLM post-edit of the just-translated misses, AND, when DeepL
    // was skipped (quota), a from-scratch translation. The post-edit prompt
    // returns a native translation of the SOURCE, so passing mt=source makes it
    // translate directly; if Claude can't (no key / error), that string keeps the
    // English source (build-safe, never empty). Cache hits are never re-edited.
    if (postEditor && misses.length) {
      const fromScratch = misses.map(([h]) => store[h] === undefined && !ephemeral.has(h));
      const items = misses.map(([h, v], k) => {
        if (fromScratch[k]) stats.claudeFromScratch += 1;
        return { source: v.source, mt: store[h] ?? ephemeral.get(h) ?? v.source };
      });
      const edited = await postEditor.postEditBatch(items, locale);
      misses.forEach(([h, v], k) => {
        const { text, violation } = normaliseDash(edited[k], locale);
        if (violation) stats.dashViolations.push({ locale, source: v.source, translation: text });
        // Nothing actually translated this one if DeepL was skipped AND the
        // post-edit handed the English straight back. Leave the cache empty so a
        // later run with budget retries it, rather than caching English as the
        // translation, which would be a permanent hit.
        if (fromScratch[k] && text === v.source) {
          stats.untranslated.push({ locale, source: v.source });
          return;
        }
        store[h] = text;
      });
    } else {
      // No post-editor: a DeepL-skipped miss has no translation behind it.
      // Report it and leave the cache alone, for the same reason.
      misses.forEach(([h, v]) => {
        if (store[h] === undefined && !ephemeral.has(h)) {
          stats.untranslated.push({ locale, source: v.source });
        }
      });
    }

    // Fill the misses back into their positions.
    texts.forEach((source, i) => {
      if (results[i] !== undefined) return;
      const h = hashSource(source, cacheSalt);
      results[i] = store[h] ?? ephemeral.get(h) ?? source;
    });
    return results;
  }

  return {
    stats,
    cacheSalt,
    translateAll,
    /** Single-string convenience wrapper. */
    async translate(text, locale) {
      return (await translateAll([text], locale))[0];
    },
  };
}

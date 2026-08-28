// Tests for the translation budget gate.
//
// Two behaviours here are load-bearing and were both real defects.
//
// 1. Cache-only mode must make paid translation IMPOSSIBLE, not merely unlikely.
//    Paid translation used to be a side effect of every deploy, and because CI
//    never commits the cache back, a string that missed once was paid for again
//    on every later deploy. That is what exhausted both quotas.
//
// 2. Nothing may ever cache the English source as a locale's translation. A
//    cache entry is a permanent HIT, so one poisoned entry freezes that string
//    to English in that locale forever, silently, on a page nobody re-reads.
//    The old code did exactly that on any DeepL-skipped miss.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createTranslator, normaliseDash, EM_DASH } from "./deepl.mjs";

const emptyCache = () => ({ version: 3, translations: {} });

/** A translator that cannot reach the network: any call is a test failure. */
function cacheOnlyTranslator(cache) {
  return createTranslator({
    apiKey: "would-throw-if-used",
    glossaryRegex: null,
    cache,
    postEditor: {
      postEditBatch: () => assert.fail("cache-only must not reach the post-editor"),
      stats: {},
    },
    cacheSalt: "pages-v1",
    cacheOnly: true,
  });
}

// ---------------------------------------------------------------- cache-only mode

test("cache-only serves a hit from the cache", async () => {
  const cache = emptyCache();
  const t = cacheOnlyTranslator(cache);
  // Seed at the same salt the translator uses.
  const { seedCache } = await import("./deepl.mjs");
  seedCache(cache, "de", "Book a session", "Buche eine Session", "pages-v1");
  const out = await t.translateAll(["Book a session"], "de");
  assert.deepEqual(out, ["Buche eine Session"]);
  assert.equal(t.stats.cacheHits, 1);
  assert.equal(t.stats.missing.length, 0);
  assert.equal(t.stats.apiCalls, 0);
});

test("cache-only records a miss and returns the English, without calling anything", async () => {
  const cache = emptyCache();
  const t = cacheOnlyTranslator(cache);
  const out = await t.translateAll(["A brand new sentence."], "fr");
  assert.deepEqual(out, ["A brand new sentence."]);
  assert.equal(t.stats.apiCalls, 0);
  assert.deepEqual(t.stats.missing, [{ locale: "fr", source: "A brand new sentence." }]);
});

test("cache-only writes NOTHING to the cache, so a miss stays retryable", async () => {
  const cache = emptyCache();
  const t = cacheOnlyTranslator(cache);
  await t.translateAll(["Untranslated for now."], "it");
  // The English must not be sitting in the cache pretending to be Italian.
  assert.deepEqual(cache.translations.it ?? {}, {});
});

test("cache-only leaves blank strings alone and does not count them as misses", async () => {
  const cache = emptyCache();
  const t = cacheOnlyTranslator(cache);
  const out = await t.translateAll(["", "   "], "pt");
  assert.deepEqual(out, ["", "   "]);
  assert.equal(t.stats.missing.length, 0);
});

// ------------------------------------------------------- no English in the cache

/**
 * Run body with DeepL answering HTTP 456 (quota exhausted), which is the exact
 * condition the 2026-08-27 deploys hit. fetch is the only seam callDeepL uses.
 */
async function withDeeplQuotaExhausted(body) {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return { ok: false, status: 456, statusText: "Quota Exceeded", text: async () => "" };
  };
  try {
    return await body(() => calls);
  } finally {
    globalThis.fetch = real;
  }
}

test("DeepL quota exhausted with no post-editor: reported, and NOT cached as English", async () => {
  await withDeeplQuotaExhausted(async (calls) => {
    const cache = emptyCache();
    const t = createTranslator({
      apiKey: "k",
      glossaryRegex: null,
      cache,
      postEditor: null,
      cacheSalt: "pages-v1",
    });
    const out = await t.translateAll(["Something new."], "de");
    assert.equal(calls(), 1, "DeepL was actually called, so this exercises the real path");
    assert.equal(t.stats.deeplExhausted, true);
    assert.deepEqual(out, ["Something new."], "output falls back to English");
    assert.deepEqual(cache.translations.de ?? {}, {}, "the cache must stay empty");
    assert.deepEqual(t.stats.untranslated, [{ locale: "de", source: "Something new." }]);
  });
});

test("DeepL quota exhausted and Claude hands the English back: still not cached", async () => {
  await withDeeplQuotaExhausted(async () => {
    const cache = emptyCache();
    const t = createTranslator({
      apiKey: "k",
      glossaryRegex: null,
      cache,
      // A failed post-edit returns the source, per createPostEditor's contract.
      postEditor: { postEditBatch: async (items) => items.map((i) => i.source), stats: {} },
      cacheSalt: "pages-v1",
    });
    const out = await t.translateAll(["Another new one."], "fr");
    assert.deepEqual(out, ["Another new one."]);
    assert.deepEqual(cache.translations.fr ?? {}, {}, "English must never become the cached translation");
    assert.deepEqual(t.stats.untranslated, [{ locale: "fr", source: "Another new one." }]);
  });
});

test("DeepL quota exhausted but Claude does translate: that IS cached", async () => {
  await withDeeplQuotaExhausted(async () => {
    const cache = emptyCache();
    const t = createTranslator({
      apiKey: "k",
      glossaryRegex: null,
      cache,
      postEditor: { postEditBatch: async () => ["Etwas Neues."], stats: {} },
      cacheSalt: "pages-v1",
    });
    const out = await t.translateAll(["Something new."], "de");
    assert.deepEqual(out, ["Etwas Neues."]);
    assert.deepEqual(Object.values(cache.translations.de), ["Etwas Neues."], "a real translation is cached");
    assert.deepEqual(t.stats.untranslated, [], "and is not reported as untranslated");
  });
});

test("a Claude translation carrying an em dash is normalised for de and flagged for fr", async () => {
  await withDeeplQuotaExhausted(async () => {
    for (const [locale, expected, flagged] of [
      ["de", "Berlin – remote", false],
      ["fr", `Berlin ${EM_DASH} remote`, true],
    ]) {
      const cache = emptyCache();
      const t = createTranslator({
        apiKey: "k",
        glossaryRegex: null,
        cache,
        postEditor: { postEditBatch: async () => [`Berlin ${EM_DASH} remote`], stats: {} },
        cacheSalt: "pages-v1",
      });
      const out = await t.translateAll(["Berlin, remote"], locale);
      assert.deepEqual(out, [expected]);
      assert.equal(t.stats.dashViolations.length, flagged ? 1 : 0, `${locale} violation flag`);
    }
  });
});

// -------------------------------------------------- raw MT must not pin the cache

/** Run body with DeepL answering successfully with `reply` for every text. */
async function withDeeplReturning(reply, body) {
  const real = globalThis.fetch;
  globalThis.fetch = async (_url, opts) => {
    const n = [...new URLSearchParams(opts.body).getAll("text")].length;
    return {
      ok: true,
      status: 200,
      json: async () => ({ translations: Array.from({ length: n }, () => ({ text: reply })) }),
    };
  };
  try {
    return await body();
  } finally {
    globalThis.fetch = real;
  }
}

test("persistWithoutPostEdit:false uses a raw DeepL result but does NOT cache it", async () => {
  await withDeeplReturning("Buche eine Session", async () => {
    const cache = emptyCache();
    const t = createTranslator({
      apiKey: "k",
      glossaryRegex: null,
      cache,
      postEditor: null, // the keyless-Claude case pages must survive
      cacheSalt: "pages-v1",
      persistWithoutPostEdit: false,
    });
    const out = await t.translateAll(["Book a session"], "de");
    assert.deepEqual(out, ["Buche eine Session"], "this build still gets the translation");
    assert.deepEqual(cache.translations.de ?? {}, {}, "but nothing is pinned into the committed cache");
    assert.deepEqual(t.stats.unpersisted, [{ locale: "de", source: "Book a session" }]);
    assert.deepEqual(t.stats.untranslated, [], "it translated, so it is not a gap");
  });
});

test("persistWithoutPostEdit:false still caches when the post-edit pass DID run", async () => {
  await withDeeplReturning("raw", async () => {
    const cache = emptyCache();
    const t = createTranslator({
      apiKey: "k",
      glossaryRegex: null,
      cache,
      postEditor: { postEditBatch: async () => ["Buche eine Session"], stats: {} },
      cacheSalt: "pages-v1",
      persistWithoutPostEdit: false,
    });
    const out = await t.translateAll(["Book a session"], "de");
    assert.deepEqual(out, ["Buche eine Session"]);
    assert.deepEqual(Object.values(cache.translations.de), ["Buche eine Session"]);
    assert.deepEqual(t.stats.unpersisted, []);
  });
});

test("the default still persists, so catalogs and blog are unaffected", async () => {
  await withDeeplReturning("Buche eine Session", async () => {
    const cache = emptyCache();
    const t = createTranslator({
      apiKey: "k",
      glossaryRegex: null,
      cache,
      postEditor: null,
      cacheSalt: "pe2",
    });
    await t.translateAll(["Book a session"], "de");
    assert.deepEqual(Object.values(cache.translations.de), ["Buche eine Session"]);
    assert.deepEqual(t.stats.unpersisted, []);
  });
});

// ------------------------------------------------------------------ dash rule

test("German and Spanish take the permitted en dash", () => {
  for (const locale of ["de", "es"]) {
    const { text, violation } = normaliseDash(`Berlin ${EM_DASH} remote`, locale);
    assert.equal(text, "Berlin – remote");
    assert.equal(violation, false);
  }
});

test("French, Italian and Portuguese flag it instead of guessing a rewrite", () => {
  for (const locale of ["fr", "it", "pt"]) {
    const { text, violation } = normaliseDash(`Berlin ${EM_DASH} remote`, locale);
    assert.equal(text, `Berlin ${EM_DASH} remote`, "text is left for a human to repunctuate");
    assert.equal(violation, true);
  }
});

test("a translation with no em dash is returned untouched and unflagged", () => {
  for (const locale of ["de", "fr"]) {
    const { text, violation } = normaliseDash("Berlin, remote", locale);
    assert.equal(text, "Berlin, remote");
    assert.equal(violation, false);
  }
});

test("normaliseDash tolerates a non-string", () => {
  const { text, violation } = normaliseDash(undefined, "de");
  assert.equal(text, undefined);
  assert.equal(violation, false);
});

test("every en dash in a German string survives, only the em dash changes", () => {
  const { text } = normaliseDash(`2022–2026 war eine Zeit ${EM_DASH} eine gute`, "de");
  assert.equal(text, "2022–2026 war eine Zeit – eine gute");
});

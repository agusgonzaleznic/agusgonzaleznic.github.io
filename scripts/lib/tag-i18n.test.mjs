// Tests for the blog tag translation map.
//
// This module owns content/tag-translations.json — 14 tags x 5 locales of
// reviewed labels, committed. Two of its behaviours could destroy that file or
// permanently pin it to English, and neither was covered.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadTagMap,
  saveTagMap,
  localizeTags,
  unmappedTags,
  ensureTagTranslations,
} from "./tag-i18n.mjs";

// MUST be async-aware. A synchronous try/finally around an async body deletes
// the directory before the body runs, and then every "the file is empty"
// assertion passes because the file is GONE rather than because the code under
// test declined to write it. Two tests here were green for exactly that reason.
const withTmp = async (fn) => {
  const dir = mkdtempSync(join(tmpdir(), "tagi18n-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

// ------------------------------------------------------------- loadTagMap

test("loadTagMap: an absent file is an empty map (fresh checkout)", async () => {
  await withTmp((dir) => {
    assert.deepEqual(loadTagMap(join(dir, "nope.json")), {});
  });
});

test("loadTagMap: a CORRUPT file throws instead of erasing every translation", async () => {
  // The destructive path: parse fails -> {} -> every tag looks untranslated ->
  // ensureTagTranslations refills -> saveTagMap writes that over the real file.
  await withTmp((dir) => {
    const f = join(dir, "tags.json");
    writeFileSync(f, '{"Leadership": {"de": "Fuhrung"');
    assert.throws(() => loadTagMap(f), /not valid JSON/);
    writeFileSync(f, "[]");
    assert.throws(() => loadTagMap(f), /must contain a JSON object/);
    writeFileSync(f, "null");
    assert.throws(() => loadTagMap(f), /must contain a JSON object/);
  });
});

test("loadTagMap: a valid file round-trips through saveTagMap", async () => {
  await withTmp((dir) => {
    const f = join(dir, "tags.json");
    const map = { Zebra: { de: "Zebra" }, Alpha: { de: "Alpha" } };
    saveTagMap(f, map);
    assert.deepEqual(loadTagMap(f), map);
    // Keys are sorted on save so the committed file has a stable diff.
    assert.match(readFileSync(f, "utf8"), /"Alpha"[\s\S]*"Zebra"/);
  });
});

// ------------------------------------------------------------- localizeTags

test("localizeTags falls back to the English tag when a locale is missing", () => {
  const map = { Leadership: { de: "Leadership" } };
  assert.deepEqual(localizeTags(["Leadership", "Coaching"], "de", map), ["Leadership", "Coaching"]);
  assert.deepEqual(localizeTags(["Leadership"], "es", map), ["Leadership"]);
  assert.deepEqual(localizeTags(null, "de", map), []);
});

test("unmappedTags reports exactly what has no label for the locale", () => {
  const map = { A: { de: "A-de" }, B: {} };
  assert.deepEqual(unmappedTags(["A", "B", "C"], "de", map), ["B", "C"]);
});

// -------------------------------------------- ensureTagTranslations, keyless

test("a failed translation is NOT persisted as the English tag", async () => {
  // With no ANTHROPIC_API_KEY the translator returns {} — the same result as an
  // SDK failure, a refusal, or a rate limit. Writing the English tag here used to
  // look identical to a finished translation, and since the missing-check tests
  // only for presence, it was never retried: one keyless build pinned every tag
  // to English in all five locales permanently.
  const prev = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    await withTmp(async (dir) => {
      const f = join(dir, "tags.json");
      const added = await ensureTagTranslations(["Leadership", "Coaching"], ["de", "es"], f);
      assert.equal(added, 0, "nothing real was translated, so nothing was added");
      // The file must not have been created with English placeholders.
      assert.deepEqual(loadTagMap(f), {}, "no placeholder entries persisted");
    });
  } finally {
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
  }
});

test("existing translations survive a keyless run untouched", async () => {
  const prev = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    await withTmp(async (dir) => {
      const f = join(dir, "tags.json");
      const real = { Leadership: { de: "Leadership", es: "Liderazgo" } };
      saveTagMap(f, real);
      await ensureTagTranslations(["Leadership", "NewTag"], ["de", "es"], f);
      assert.deepEqual(loadTagMap(f), real, "the reviewed map must be byte-equal after a keyless run");
    });
  } finally {
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
  }
});

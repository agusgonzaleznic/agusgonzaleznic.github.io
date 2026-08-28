// Tests for the ICU guard in the LLM post-edit pass.
//
// placeholdersPreserved decides whether Claude's candidate replaces the raw
// machine translation. It compares the "protected tokens" of source and
// candidate, and a depth-0 `{...}` used to be collected WHOLE, which made the
// guard reject the only outcome anyone wants for a plural: a translated one.
//
// protect() masks a whole ICU expression before DeepL sees it, so for a message
// that is nothing but a plural the raw MT is the English source byte-for-byte.
// The guard then rejected any candidate that translated the submessage bodies and
// kept that English. Net effect: plural messages could never be translated, and
// nothing warned. Both directions are pinned here, because relaxing a guard is
// only safe if what it still catches is written down.

import { test } from "node:test";
import assert from "node:assert/strict";
import { icuSkeleton } from "./llm-postedit.mjs";

const PLURAL_EN = "{0, plural, one {about # minute} other {about # minutes}}";

// ------------------------------------------------- what the guard must ALLOW

test("a plain placeholder is unchanged, so the guard stays exactly as strict", () => {
  assert.equal(icuSkeleton("{count}"), "{count}");
  assert.equal(icuSkeleton("{name}"), "{name}");
});

test("a typed non-plural argument is unchanged too", () => {
  assert.equal(icuSkeleton("{n, number}"), "{n, number}");
  assert.equal(icuSkeleton("{when, date, short}"), "{when, date, short}");
});

test("translating the submessage bodies is allowed", () => {
  const de = "{0, plural, one {etwa # Minute} other {etwa # Minuten}}";
  const fr = "{0, plural, one {environ # minute} other {environ # minutes}}";
  assert.equal(icuSkeleton(de), icuSkeleton(PLURAL_EN));
  assert.equal(icuSkeleton(fr), icuSkeleton(PLURAL_EN));
});

test("reordering the categories is allowed, since ICU is keyword-addressed", () => {
  const swapped = "{0, plural, other {about # minutes} one {about # minute}}";
  assert.equal(icuSkeleton(swapped), icuSkeleton(PLURAL_EN));
});

// ------------------------------------------------- what the guard must REJECT

test("renaming the argument is rejected", () => {
  assert.notEqual(icuSkeleton("{1, plural, one {about # minute} other {about # minutes}}"), icuSkeleton(PLURAL_EN));
  assert.notEqual(icuSkeleton("{n, plural, one {about # minute} other {about # minutes}}"), icuSkeleton(PLURAL_EN));
});

test("dropping a category is rejected", () => {
  assert.notEqual(icuSkeleton("{0, plural, other {about # minutes}}"), icuSkeleton(PLURAL_EN));
});

test("inventing a category is rejected", () => {
  assert.notEqual(
    icuSkeleton("{0, plural, one {a} few {b} other {c}}"),
    icuSkeleton("{0, plural, one {a} other {c}}"),
  );
});

test("losing a # marker is rejected, which is the one that would corrupt output", () => {
  assert.notEqual(icuSkeleton("{0, plural, one {about a minute} other {about # minutes}}"), icuSkeleton(PLURAL_EN));
});

test("changing the type is rejected", () => {
  assert.notEqual(
    icuSkeleton("{0, selectordinal, one {about # minute} other {about # minutes}}"),
    icuSkeleton(PLURAL_EN),
  );
});

test("a nested placeholder must survive", () => {
  const withName = "{0, plural, one {{name} has # item} other {{name} has # items}}";
  const dropped = "{0, plural, one {has # item} other {has # items}}";
  assert.notEqual(icuSkeleton(withName), icuSkeleton(dropped));
  // and renaming it is rejected too
  const renamed = "{0, plural, one {{who} has # item} other {{who} has # items}}";
  assert.notEqual(icuSkeleton(withName), icuSkeleton(renamed));
});

test("the real catalog plurals round-trip against their real translations", () => {
  // The two messages this finding is actually about, with the hand translations
  // committed in the catalogs.
  const pairs = [
    ["{seconds, plural, one {# second} other {# seconds}}", "{seconds, plural, one {# Sekunde} other {# Sekunden}}"],
    [PLURAL_EN, "{0, plural, one {ungefähr # Minute} other {ungefähr # Minuten}}"],
  ];
  for (const [en, de] of pairs) assert.equal(icuSkeleton(de), icuSkeleton(en));
});

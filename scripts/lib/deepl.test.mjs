// Tests for the placeholder masking that wraps every machine translation.
//
// protect() replaces spans that must survive translation byte-for-byte (ICU
// placeholders, Lingui/HTML component tags, URLs, emails, glossary terms) with
// <x>N</x> sentinels, and restore() puts them back. A bug in either corrupts
// every string in every locale catalog, so the round trip is pinned here.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  protect,
  restore,
  loadGlossaryTerms,
  nextQuotaReset,
  keepExistingWhenUnchanged,
} from "./deepl.mjs";

/** A translator that changes nothing: restore(protect(x)) must be identity. */
const roundTrip = (text, glossaryRegex) => {
  const { payload, originals } = protect(text, glossaryRegex);
  return restore(payload, originals);
};

// ------------------------------------------------------------ identity round trip

test("round trip is identity for plain text", () => {
  assert.equal(roundTrip("Just a sentence."), "Just a sentence.");
});

test("component tags survive", () => {
  const s = "Read the <0>privacy notice</0> or <1/> contact me.";
  assert.equal(roundTrip(s), s);
});

test("interpolations survive", () => {
  const s = "At most {MESSAGE_MAX} characters, at least {MESSAGE_MIN}.";
  assert.equal(roundTrip(s), s);
});

test("urls, www hosts and emails survive", () => {
  const s = "See https://agusgonzaleznic.com/privacy or www.example.com, or mail info@agusgonzaleznic.com.";
  assert.equal(roundTrip(s), s);
});

test("glossary terms survive", () => {
  // Same shape loadGlossary builds: longest-first alternation, case-sensitive.
  const re = /\b(Storyblok|Berlin)\b/g;
  const s = "Hosted in Berlin, content in Storyblok.";
  assert.equal(roundTrip(s, re), s);
});

test("adjacent and repeated placeholders keep their order", () => {
  const s = "{a}{b} then {a} again, and <0>x</0><1>y</1>.";
  const out = roundTrip(s);
  assert.equal(out, s);
});

test("XML-significant characters in the free text are escaped and unescaped", () => {
  // The payload goes to DeepL with tag_handling=xml, so a bare & or < in the
  // source must not be able to break the document, and must come back intact.
  const s = `Fish & chips < 5 > 3, "quoted" and 'apostrophed'.`;
  assert.equal(roundTrip(s), s);
  const { payload } = protect(s);
  assert.ok(!/(?<!&)&(?!amp;|lt;|gt;|quot;|#39;)/.test(payload), "raw ampersands must be escaped in the payload");
});

test("a translated payload restores with the placeholders in place", () => {
  const s = "Try again in {minutes} minutes, see <0>the FAQ</0>.";
  const { payload, originals } = protect(s);
  // Simulate DeepL: translate the exposed words, leave <x>N</x> untouched.
  const translated = payload.replace("Try again in", "Versuche es erneut in").replace("minutes, see", "Minuten, siehe");
  const out = restore(translated, originals);
  assert.equal(out, "Versuche es erneut in {minutes} Minuten, siehe <0>the FAQ</0>.");
  assert.ok(out.includes("{minutes}"), "the ICU placeholder came back verbatim");
});

// ------------------------------------------------- the ICU plural limitation

test("an ICU plural is masked WHOLE: its sub-messages are never exposed", () => {
  // braceRanges() returns the OUTERMOST balanced range, so the entire plural
  // (including the translatable "second"/"seconds") becomes one sentinel. A
  // translator therefore cannot touch it, and a from-scratch run returns the
  // English source unchanged.
  //
  // This is pinned as a known limitation rather than as desired behaviour: the
  // catalogs currently hold correct plural translations, and the protections
  // against losing them live in scripts/translate.mjs (never overwrite a real
  // translation with one identical to the source) and in the i18n:check guard.
  const s = "{seconds, plural, one {# second} other {# seconds}}";
  const { payload, originals } = protect(s);
  assert.equal(payload, "<x>0</x>", "the whole plural is a single sentinel");
  assert.deepEqual(originals, [s]);
  assert.equal(restore(payload, originals), s, "so a no-op translation returns English");
});

test("text around a plural IS still exposed", () => {
  const s = "Wait {seconds, plural, one {# second} other {# seconds}} before retrying.";
  const { payload } = protect(s);
  assert.ok(payload.includes("Wait "), "leading text exposed");
  assert.ok(payload.includes(" before retrying."), "trailing text exposed");
});

// ------------------------------------------- the regression guard

const PLURAL = "{seconds, plural, one {# second} other {# seconds}}";

test("a plural returned unchanged from English keeps the existing translation", () => {
  const { translations, keptIds } = keepExistingWhenUnchanged({
    keys: [PLURAL],
    sources: [PLURAL],
    translations: [PLURAL], // what a from-scratch run produces: the source, verbatim
    previous: new Map([[PLURAL, "{seconds, plural, one {# Sekunde} other {# Sekunden}}"]]),
  });
  assert.deepEqual(translations, ["{seconds, plural, one {# Sekunde} other {# Sekunden}}"]);
  assert.deepEqual(keptIds, [PLURAL]);
});

test("a genuine new translation is never blocked", () => {
  const { translations, keptIds } = keepExistingWhenUnchanged({
    keys: ["Hello"],
    sources: ["Hello"],
    translations: ["Hallo"],
    previous: new Map([["Hello", "Guten Tag"]]),
  });
  assert.deepEqual(translations, ["Hallo"], "an improved translation wins");
  assert.deepEqual(keptIds, []);
});

test("a legitimately identical translation stays identical", () => {
  // "Coaching" is "Coaching" in German. Nothing to keep back, nothing to warn.
  const { translations, keptIds } = keepExistingWhenUnchanged({
    keys: ["Coaching"],
    sources: ["Coaching"],
    translations: ["Coaching"],
    previous: new Map([["Coaching", "Coaching"]]),
  });
  assert.deepEqual(translations, ["Coaching"]);
  assert.deepEqual(keptIds, []);
});

test("a first translation with no previous value is left alone even if it equals the source", () => {
  const { translations, keptIds } = keepExistingWhenUnchanged({
    keys: [PLURAL],
    sources: [PLURAL],
    translations: [PLURAL],
    previous: new Map(),
  });
  assert.deepEqual(translations, [PLURAL], "nothing to fall back to");
  assert.deepEqual(keptIds, []);
});

// ------------------------------------------------------------------- misc

test("nextQuotaReset rolls to the next month when the day has passed", () => {
  assert.equal(nextQuotaReset(5, new Date("2026-03-10T00:00:00Z")).slice(0, 10), "2026-04-05");
  assert.equal(nextQuotaReset(5, new Date("2026-03-01T00:00:00Z")).slice(0, 10), "2026-03-05");
});

test("loadGlossaryTerms on an absent file is empty, not a throw", () => {
  assert.deepEqual(loadGlossaryTerms("/nonexistent/glossary.json"), []);
});

// Tests for the blog importer's pure helpers.

import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeEntities, mergeStoryContent, NAMED_ENTITIES, IMPORTER_KEYS } from "./post-import.mjs";

// ---------------------------------------------------------- decodeEntities

test("the XML five and nbsp still decode", () => {
  assert.equal(decodeEntities("a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;"), `a & b <c> "d" 'e'`);
  // Asserted by CODE POINT, not by a literal: a no-break space and a plain space
  // are indistinguishable in source, and comparing the two produced the
  // gloriously unhelpful `'x y' !== 'x y'`.
  assert.deepEqual(
    [...decodeEntities("x&nbsp;y")].map((c) => c.codePointAt(0)),
    [0x78, 0x00a0, 0x79],
  );
});

test("typographic entities decode instead of publishing literally", () => {
  // These reached the published post, the excerpt, the RSS description and the
  // text sent to DeepL as the seven characters "&rsquo;".
  assert.equal(decodeEntities("it&rsquo;s"), "it’s");
  assert.equal(decodeEntities("a &mdash; b"), "a — b");
  assert.equal(decodeEntities("a &ndash; b"), "a – b");
  assert.equal(decodeEntities("&ldquo;quoted&rdquo;"), "“quoted”");
  assert.equal(decodeEntities("wait&hellip;"), "wait…");
});

test("numeric entities decode in decimal and hex", () => {
  assert.equal(decodeEntities("&#8217;"), "’");
  assert.equal(decodeEntities("&#x2019;"), "’");
  assert.equal(decodeEntities("&#x1F600;"), "\u{1F600}");
});

test("an OUT-OF-RANGE numeric entity is left alone instead of crashing", () => {
  // Number.isFinite(1e9) is true and String.fromCodePoint(1e9) throws
  // RangeError, which aborted the entire import on one malformed entity.
  for (const bad of ["&#1114112;", "&#x110000;", "&#99999999;"]) {
    assert.doesNotThrow(() => decodeEntities(bad));
    assert.equal(decodeEntities(bad), bad, `${bad} must survive verbatim`);
  }
  assert.equal(decodeEntities("&#x10FFFF;"), "\u{10FFFF}", "the boundary itself still decodes");
});

test("an unknown named entity is left verbatim, not mangled", () => {
  assert.equal(decodeEntities("&notarealentity;"), "&notarealentity;");
  assert.equal(decodeEntities("5 &lt; 6 &badness; 7"), "5 < 6 &badness; 7");
});

test("entity decoding does not corrupt surrounding text", () => {
  const s = "Ampersand-heavy: R&amp;D, AT&amp;T, and &rsquo;90s nostalgia.";
  assert.equal(decodeEntities(s), "Ampersand-heavy: R&D, AT&T, and ’90s nostalgia.");
});

test("every NAMED_ENTITIES value is a real string", () => {
  for (const [k, v] of Object.entries(NAMED_ENTITIES)) {
    assert.equal(typeof v, "string", `${k} must map to a string`);
    assert.ok(v.length > 0, `${k} must not be empty`);
  }
});

// -------------------------------------------------------- mergeStoryContent

const built = (over = {}) => ({
  component: "blog_post",
  title: "A title",
  excerpt: "An excerpt",
  body: { type: "doc", content: [] },
  published_date: "2026-01-01 09:00",
  seo_title: "",
  seo_description: "",
  original_url: "",
  canonical_override: "",
  ...over,
});

test("a field the importer never builds is preserved (cover_image)", () => {
  const prior = { cover_image: { filename: "https://a.storyblok.com/x.jpg", alt: "Cover" } };
  const out = mergeStoryContent(prior, built());
  assert.deepEqual(out.cover_image, prior.cover_image);
});

test("empty imported values do NOT clobber real CMS values", () => {
  const prior = {
    seo_title: "Hand-tuned SEO title",
    seo_description: "Hand-tuned description",
    original_url: "https://medium.com/@me/original",
    canonical_override: "https://example.com/original",
  };
  const out = mergeStoryContent(prior, built());
  assert.equal(out.seo_title, "Hand-tuned SEO title");
  assert.equal(out.seo_description, "Hand-tuned description");
  assert.equal(out.original_url, "https://medium.com/@me/original");
  // Losing this one silently re-enables five locale variants of a syndicated
  // post, because canonical_override is what gates them.
  assert.equal(out.canonical_override, "https://example.com/original");
});

test("a non-empty imported value wins", () => {
  const prior = { seo_title: "Old", title: "Old title" };
  const out = mergeStoryContent(prior, built({ seo_title: "New", title: "New title" }));
  assert.equal(out.seo_title, "New");
  assert.equal(out.title, "New title");
});

test("the body is always replaced: that is the point of re-importing", () => {
  const prior = { body: { type: "doc", content: [{ type: "paragraph" }] } };
  const next = built({ body: { type: "doc", content: [{ type: "heading" }] } });
  assert.deepEqual(mergeStoryContent(prior, next).body, next.body);
});

test("an empty body does not wipe a real one", () => {
  const prior = { body: { type: "doc", content: [{ type: "paragraph" }] } };
  const out = mergeStoryContent(prior, built({ body: "" }));
  assert.deepEqual(out.body, prior.body);
});

test("a first import with no prior content is unchanged", () => {
  const next = built({ seo_title: "T" });
  assert.deepEqual(mergeStoryContent({}, next), next);
  assert.deepEqual(mergeStoryContent(undefined, next), next);
});

test("keys outside IMPORTER_KEYS are never touched", () => {
  const prior = { cover_image: { filename: "x" }, some_future_field: 42, _uid: "abc" };
  const out = mergeStoryContent(prior, built());
  for (const k of Object.keys(prior)) {
    assert.deepEqual(out[k], prior[k], `${k} must survive`);
    assert.ok(!IMPORTER_KEYS.includes(k), `${k} is correctly outside IMPORTER_KEYS`);
  }
});

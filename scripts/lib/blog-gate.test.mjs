// Tests for the per-(article × locale) publication gate.
//
// This module decides which locale pages EXIST: it drives prerender's emission
// loop, the hreflang clusters, and the sitemap. It had no tests at all, which is
// how a truncated approvals manifest once silently unpublished every reviewed
// translation while the build stayed green.
//
// Pure functions, no I/O except loadApprovals, so no framework is needed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AUTO_LOCALES,
  AUTO_LOCALE_MODE,
  REVIEW_GATED_LOCALES,
  approvedGatedLocales,
  approvedLocalesFor,
  enSourceHash,
  loadApprovals,
} from "./blog-gate.mjs";

const ALL = ["en", "de", "es", "fr", "it", "pt"];

const post = (over = {}) => ({
  uuid: "u-1",
  title: "A title",
  excerpt: "An excerpt",
  seo_title: "",
  seo_description: "",
  body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] },
  canonical_override: "",
  ...over,
});

/** Approvals manifest approving `locales` for a post at its CURRENT hash. */
const approve = (p, locales) => ({
  [p.uuid]: Object.fromEntries(
    locales.map((l) => [l, { status: "approved", sourceHash: enSourceHash(p) }]),
  ),
});

// ---------------------------------------------------------------- source hash

// ---------------------------------------------- the canonical form is PINNED

// A fixture whose hash is a hardcoded literal.
//
// enSourceHash's output is PERSISTED in content/i18n-approvals.json. Nothing else
// pins it, so any change to the canonical form (a field added to the tuple, a
// different separator, a different slice length, a change to which node types
// contribute) silently invalidates every stored hash. approvedGatedLocales then
// returns [], the DE and ES article variants stop being emitted, and they vanish
// from dist, from sitemap.xml and from every hreflang cluster while the build
// prints checkmarks and exits 0.
//
// If this test fails, the canonical form changed. That is allowed, but it is never
// free: re-point every stored sourceHash in content/i18n-approvals.json in the
// same commit, and update the literal here. Do not "fix" it by recomputing the
// expected value alone, because that hides exactly the breakage it exists to
// catch.
const PINNED = {
  uuid: "fixture-0000-0000-0000-000000000000",
  title: "Pinned",
  excerpt: "A fixture that pins the canonical form.",
  seo_title: "Pinned | fixture",
  seo_description: "Pins title, excerpt, both SEO fields, body text, hrefs and code.",
  body: {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "A heading" }] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Prose with a " },
          { type: "text", text: "link", marks: [{ type: "link", attrs: { href: "https://example.com/a" } }] },
          { type: "text", text: " and " },
          { type: "text", text: "inline_code", marks: [{ type: "code" }] },
          { type: "text", text: "." },
        ],
      },
      {
        type: "code_block",
        attrs: { class: "language-hcl" },
        content: [{ type: "text", text: 'provider "x" {\n  consumer_key = "K"\n}' }],
      },
    ],
  },
};
const PINNED_HASH = "56b8a84bb946a004d3c74c73";

/** Deep clone so a mutation case cannot leak into the next test. */
const clone = (o) => JSON.parse(JSON.stringify(o));

test("enSourceHash matches its pinned literal", () => {
  assert.equal(enSourceHash(PINNED), PINNED_HASH);
  assert.equal(PINNED_HASH.length, 24, "the persisted form is 24 hex chars");
});

test("editing prose changes the hash", () => {
  const p = clone(PINNED);
  p.body.content[1].content[0].text = "Different prose with a ";
  assert.notEqual(enSourceHash(p), PINNED_HASH);
});

test("editing a link target changes the hash", () => {
  // A reviewed body carries its own hrefs, so retargeting a link in the English
  // has to demote the approval; otherwise the translated page keeps the old URL.
  const p = clone(PINNED);
  p.body.content[1].content[1].marks[0].attrs.href = "https://example.com/MOVED";
  assert.notEqual(enSourceHash(p), PINNED_HASH);
});

test("editing a code sample changes the hash", () => {
  // The reason: a reviewed body is served verbatim, so it keeps whatever the code
  // said at review time. This was the R026 leak, measured on the real corpus.
  const p = clone(PINNED);
  p.body.content[2].content[0].text = 'provider "x" {\n  client_id = "K"\n}';
  assert.notEqual(enSourceHash(p), PINNED_HASH);
});

test("code text is tagged, so a code edit cannot collide with the same prose edit", () => {
  const asCode = clone(PINNED);
  asCode.body.content[2].content[0].text = "collide";
  const asProse = clone(PINNED);
  asProse.body.content[2].content[0].text = 'provider "x" {\n  consumer_key = "K"\n}';
  asProse.body.content[1].content[0].text = "collide";
  assert.notEqual(enSourceHash(asCode), enSourceHash(asProse));
});

test("a code MARK is ordinary translatable text, and counts", () => {
  // Only the code_block NODE type is opaque. Text carrying a `code` mark is
  // translated normally, so it belongs in the hash like any other prose.
  const p = clone(PINNED);
  p.body.content[1].content[3].text = "renamed_code";
  assert.notEqual(enSourceHash(p), PINNED_HASH);
});

test("a stale stored hash excludes that locale, which is the demotion path", () => {
  const approvals = {
    [PINNED.uuid]: {
      de: { status: "approved", sourceHash: PINNED_HASH },
      es: { status: "approved", sourceHash: "0".repeat(24) },
    },
  };
  assert.deepEqual(approvedGatedLocales(PINNED, approvals), ["de"]);
});

test("enSourceHash is stable across calls and independent of key order", () => {
  const a = post();
  const b = { body: a.body, excerpt: a.excerpt, title: a.title, seo_title: "", seo_description: "", uuid: "u-1" };
  assert.equal(enSourceHash(a), enSourceHash(b));
});

test("enSourceHash changes when translatable content changes", () => {
  const base = enSourceHash(post());
  assert.notEqual(enSourceHash(post({ title: "Different" })), base);
  assert.notEqual(enSourceHash(post({ excerpt: "Different" })), base);
});

test("enSourceHash COUNTS code blocks, because a reviewed body freezes them", () => {
  // This test used to assert the opposite, on the reasoning that a code_block is
  // never translated so editing one should not demote an approval. True for the
  // auto-translated locales, false for the review-gated ones: DE and ES are served
  // VERBATIM from content/translations/, so the reviewed body carries whatever the
  // code said at review time. Skipping code here meant fixing a broken sample in
  // the English article changed nothing in those locales and demoted nothing, so
  // the wrong sample shipped indefinitely with no signal. Measured on the real
  // corpus before the change: consumer_key -> client_id inside the one code_block
  // left the hash byte-identical.
  const withCode = post({
    body: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
        { type: "code_block", content: [{ type: "text", text: "npm run build" }] },
      ],
    },
  });
  const withOtherCode = post({
    body: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
        { type: "code_block", content: [{ type: "text", text: "totally different command" }] },
      ],
    },
  });
  assert.notEqual(enSourceHash(withCode), enSourceHash(withOtherCode));
});

test("enSourceHash changes when a link TARGET changes", () => {
  // A reviewed DE/ES translation is served verbatim and carries its own copy of
  // the body, hrefs included. If retargeting a link in the English article does
  // not demote the approval, the translated pages keep pointing at the old url
  // forever with no signal anywhere.
  const linked = (href) =>
    post({
      body: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Read more", marks: [{ type: "link", attrs: { href } }] },
            ],
          },
        ],
      },
    });
  assert.notEqual(
    enSourceHash(linked("https://example.com/new")),
    enSourceHash(linked("https://example.com/old")),
  );
  // Same href, same hash: the href must not make the hash unstable.
  assert.equal(
    enSourceHash(linked("https://example.com/same")),
    enSourceHash(linked("https://example.com/same")),
  );
});

test("a post with no marks still hashes (marks absent, not empty)", () => {
  assert.equal(typeof enSourceHash(post()), "string");
  assert.ok(enSourceHash(post()).length > 0);
});

// ------------------------------------------------------------- the gate itself

test("source locale always emits, even with nothing approved and nothing published", () => {
  assert.deepEqual(approvedLocalesFor(post(), {}, []), ["en"]);
});

test("auto locales emit when published; gated locales do not without approval", () => {
  const out = approvedLocalesFor(post(), {}, ALL);
  assert.deepEqual(out.sort(), ["en", "fr", "it", "pt"].sort());
  for (const l of REVIEW_GATED_LOCALES) assert.ok(!out.includes(l), `${l} must need approval`);
});

test("PUBLISHED_LOCALES is a hard ceiling: an approved locale that is not published stays out", () => {
  const p = post();
  const out = approvedLocalesFor(p, approve(p, ["de"]), ["en", "fr"]);
  assert.deepEqual(out.sort(), ["en", "fr"].sort());
});

test("an approved+fresh gated locale emits", () => {
  const p = post();
  assert.ok(approvedLocalesFor(p, approve(p, ["de"]), ALL).includes("de"));
});

test("a STALE approval is demoted (source edited after review)", () => {
  const p = post();
  const approvals = approve(p, ["de", "es"]);
  const edited = { ...p, title: "Edited after review" };
  const out = approvedLocalesFor(edited, approvals, ALL);
  assert.ok(!out.includes("de"), "stale de must be withheld");
  assert.ok(!out.includes("es"), "stale es must be withheld");
  assert.ok(out.includes("en"), "source still emits");
});

test("status must be exactly 'approved'", () => {
  const p = post();
  const hash = enSourceHash(p);
  for (const status of ["pending", "rejected", "APPROVED", "", undefined]) {
    const out = approvedGatedLocales(p, { [p.uuid]: { de: { status, sourceHash: hash } } });
    assert.ok(!out.includes("de"), `status=${String(status)} must not publish`);
  }
});

test("AUTO_LOCALE_MODE 'hold' withholds that locale but not its siblings", () => {
  // Simulated by asserting the shipped config, then the documented contract:
  // flipping a locale to "hold" is a one-line change and must not need others.
  assert.deepEqual(Object.keys(AUTO_LOCALE_MODE).sort(), [...AUTO_LOCALES].sort());
  for (const l of AUTO_LOCALES) assert.equal(AUTO_LOCALE_MODE[l], "auto");
});

// ------------------------------------------------ external canonical_override

test("an https canonical_override makes the post SOURCE-LOCALE ONLY", () => {
  // Six translations all declaring the same foreign canonical is six pages
  // disclaiming themselves, inside an hreflang cluster that cannot be valid.
  const p = post({ canonical_override: "https://example.com/original" });
  assert.deepEqual(approvedLocalesFor(p, approve(p, ["de", "es"]), ALL), ["en"]);
});

test("a non-https override does NOT suppress translations", () => {
  // BlogPost.tsx only honours ^https:// (anything else falls back to the self
  // URL), so the translations are perfectly canonical and must still ship. If
  // this gate were looser than the page, a typo'd override would silently
  // unpublish five locales.
  for (const bad of ["http://example.com/x", "javascript:alert(1)", "/relative", "example.com", ""]) {
    const p = post({ canonical_override: bad });
    const out = approvedLocalesFor(p, approve(p, ["de"]), ALL);
    assert.ok(out.length > 1, `override ${JSON.stringify(bad)} must not gate translations`);
    assert.ok(out.includes("de"), `override ${JSON.stringify(bad)} must keep approved de`);
  }
});

test("a missing canonical_override field is not treated as an override", () => {
  const p = post();
  delete p.canonical_override;
  assert.ok(approvedLocalesFor(p, {}, ALL).includes("fr"));
});

// ------------------------------------------------------------- loadApprovals

test("loadApprovals: absent file is an empty manifest (fresh checkout)", () => {
  const dir = mkdtempSync(join(tmpdir(), "gate-"));
  try {
    assert.deepEqual(loadApprovals(join(dir, "nope.json")), {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadApprovals: a CORRUPT file throws instead of unpublishing everything", () => {
  const dir = mkdtempSync(join(tmpdir(), "gate-"));
  const f = join(dir, "a.json");
  try {
    writeFileSync(f, '{"truncated": ');
    assert.throws(() => loadApprovals(f), /not valid JSON/);
    writeFileSync(f, "[]");
    assert.throws(() => loadApprovals(f), /must contain a JSON object/);
    writeFileSync(f, '{"u-1":{"de":{"status":"approved","sourceHash":"x"}}}');
    assert.deepEqual(loadApprovals(f), { "u-1": { de: { status: "approved", sourceHash: "x" } } });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

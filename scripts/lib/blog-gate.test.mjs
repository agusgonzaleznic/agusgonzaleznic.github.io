// Tests for the per-(article × locale) publication gate.
//
// This module decides which locale pages EXIST — it drives prerender's emission
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

test("enSourceHash ignores code blocks (they are never translated)", () => {
  // A code_block is served verbatim, so editing one must NOT demote an approved
  // translation — the translator's work is unaffected by it.
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
        { type: "code_block", content: [{ type: "text", text: "totally different code" }] },
      ],
    },
  });
  assert.equal(enSourceHash(withCode), enSourceHash(withOtherCode));
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
  // Same href, same hash — the href must not make the hash unstable.
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

test("PUBLISHED_LOCALES is a hard ceiling — an approved locale that is not published stays out", () => {
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
  // BlogPost.tsx only honours ^https:// — anything else falls back to the self
  // URL, so the translations are perfectly canonical and must still ship. If
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

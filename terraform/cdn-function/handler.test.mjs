// Unit tests for the CloudFront viewer-request function.
//
// The function decides the canonical URL of every page on the site, and it had
// ZERO tests — a mistake in it is a site-wide SEO or availability incident that
// only shows up in Search Console weeks later. These tests render the Terraform
// template exactly as templatefile() does (the sole substitution is
// ${domain_name}) and assert the whole routing table.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DOMAIN = "agusgonzaleznic.com";
const here = dirname(fileURLToPath(import.meta.url));

// Mirror templatefile(): substitute ${domain_name}. If a second variable is ever
// added to the template this throws, so the test cannot silently drift from the
// Terraform call site.
function renderHandler() {
  const src = readFileSync(resolve(here, "handler.js.tftpl"), "utf8");
  const rendered = src.replaceAll("${domain_name}", DOMAIN);
  const leftover = rendered.match(/\$\{[a-z_]+\}/i);
  assert.equal(
    leftover,
    null,
    `template has an unsubstituted variable ${leftover?.[0]} — add it to renderHandler AND to the templatefile() call in cdn.tf`,
  );
  return new Function(`${rendered}; return handler;`)();
}

const handler = renderHandler();

function run(uri, { host = DOMAIN, querystring = {} } = {}) {
  const res = handler({
    request: { uri, querystring, headers: { host: { value: host } } },
  });
  if (res.statusCode) return { kind: "redirect", status: res.statusCode, location: res.headers.location.value };
  return { kind: "pass", uri: res.uri };
}

const abs = (p) => `https://${DOMAIN}${p}`;

// --- Canonical forms serve 200 (these are the sitemap/canonical/hreflang URLs)
for (const [uri, servedAs] of [
  ["/", "/"],                                       // root: origin serves the index
  ["/de/", "/de/"],                                 // locale home
  ["/blog/", "/blog/"],                             // blog index
  ["/blog/my-post/", "/blog/my-post/"],             // blog post
  ["/de/blog/my-post/", "/de/blog/my-post/"],
  ["/blog/rss.xml", "/blog/rss.xml"],               // feed (a real file)
  ["/sitemap.xml", "/sitemap.xml"],
  ["/llms.txt", "/llms.txt"],
  ["/.nojekyll", "/.nojekyll"],                     // dotfile is a FILE, not a slug
  ["/assets/index-abc123.js", "/assets/index-abc123.js"],
  ["/fonts/inter.woff2", "/fonts/inter.woff2"],
  ["/drive-berlin/", "/drive-berlin/"],             // proxied project site
  ["/drive-berlin/css/base.css", "/drive-berlin/css/base.css"],
]) {
  test(`canonical ${uri} passes through as ${servedAs}`, () => {
    const r = run(uri);
    assert.equal(r.kind, "pass", `expected pass-through, got ${JSON.stringify(r)}`);
    assert.equal(r.uri, servedAs);
  });
}

// --- Bare marketing pages are served by an INTERNAL rewrite, never a redirect
for (const [uri, rewritten] of [
  ["/about", "/about/index.html"],
  ["/impressum", "/impressum/index.html"],
  ["/de/faq", "/de/faq/index.html"],
  ["/pt/services", "/pt/services/index.html"],
  ["/links", "/links/index.html"],
]) {
  test(`bare ${uri} is rewritten to ${rewritten} (200, no redirect)`, () => {
    const r = run(uri);
    assert.equal(r.kind, "pass");
    assert.equal(r.uri, rewritten);
  });
}

// --- Non-canonical forms take exactly ONE redirect to the canonical form
for (const [uri, location] of [
  ["/about/", "/about"],                    // stray slash on a bare page
  ["/de/faq/", "/de/faq"],
  ["/blog", "/blog/"],                      // missing slash in the slash subtree
  ["/de/blog", "/de/blog/"],
  ["/blog/my-post", "/blog/my-post/"],
  ["/de", "/de/"],                          // locale home without the slash
  ["/drive-berlin", "/drive-berlin/"],      // project site without the slash
]) {
  test(`${uri} -> 301 ${location}`, () => {
    const r = run(uri);
    assert.equal(r.kind, "redirect");
    assert.equal(r.status, 301);
    assert.equal(r.location, abs(location));
  });
}

// --- REGRESSION: a dotted slug must not be mistaken for a file.
//
// `lastSegment.includes('.')` classified these as files, so they bypassed
// canonicalisation, reached GitHub Pages bare, and the ORIGIN 301'd the visitor
// to agusgonzaleznic.github.io — off the apex, losing the per-behaviour
// CSP/HSTS headers.
for (const slug of [
  "terraform-1.9-moved-blocks",
  "python-3.13-whats-new",
  "upgrading-to-node-22.1",
  "why-i-left-v2.0",
]) {
  test(`dotted slug /blog/${slug} is canonicalised, not passed to the origin`, () => {
    const r = run(`/blog/${slug}`);
    assert.equal(r.kind, "redirect", `dotted slug leaked to the origin: ${JSON.stringify(r)}`);
    assert.equal(r.location, abs(`/blog/${slug}/`));
  });
  test(`dotted slug /blog/${slug}/ serves 200`, () => {
    const r = run(`/blog/${slug}/`);
    assert.equal(r.kind, "pass");
    assert.equal(r.uri, `/blog/${slug}/`);
  });
}

// --- Real extensions must still be treated as files (the allow-list trap)
for (const file of [
  "/drive-berlin/data/points.geojson",
  "/drive-berlin/app.wasm",
  "/site.webmanifest",
  "/assets/bundle.min.js",
  "/drive-berlin/audio/clip.mp3",
]) {
  test(`${file} is treated as a file, not redirected`, () => {
    const r = run(file);
    assert.equal(r.kind, "pass", `a real asset got redirected: ${JSON.stringify(r)}`);
    assert.equal(r.uri, file);
  });
}

// --- Duplicate slashes and dot segments: canonicalised, not served as 200 dupes
for (const [uri, location] of [
  ["//blog", "/blog/"],
  ["///blog", "/blog/"],
  ["//blog/", "/blog/"],
  ["//about", "/about"],
  ["//de/blog", "/de/blog/"],
  ["/blog//my-post/", "/blog/my-post/"],
  ["/about/.", "/about"],
  ["/de/../about", "/about"],
  ["/blog/./", "/blog/"],
]) {
  test(`${uri} -> 301 ${location} (normalised, one hop)`, () => {
    const r = run(uri);
    assert.equal(r.kind, "redirect", `expected canonicalisation, got ${JSON.stringify(r)}`);
    assert.equal(r.location, abs(location));
  });
}

// --- www: host AND path canonicalised in a SINGLE hop
for (const [uri, location] of [
  ["/about", "/about"],
  ["/blog", "/blog/"],       // previously 2 hops: www->apex, then bare->slash
  ["/about/", "/about"],     // previously 2 hops
  ["//blog", "/blog/"],      // previously 3 hops
]) {
  test(`www${uri} -> ONE 301 to ${location}`, () => {
    const r = run(uri, { host: `www.${DOMAIN}` });
    assert.equal(r.kind, "redirect");
    assert.equal(r.location, abs(location));
  });
}

test("www on an already-canonical path still redirects exactly once", () => {
  const r = run("/blog/", { host: `www.${DOMAIN}` });
  assert.equal(r.kind, "redirect");
  assert.equal(r.location, abs("/blog/"));
});

// --- Query strings survive canonicalisation
test("query string is preserved through a redirect", () => {
  const r = run("/blog", { querystring: { utm_source: { value: "rss" } } });
  assert.equal(r.location, `${abs("/blog/")}?utm_source=rss`);
});

test("valueless and multi-value query params are preserved", () => {
  const r = run("/blog", {
    querystring: {
      flag: { value: "" },
      tag: { value: "a", multiValue: [{ value: "a" }, { value: "b" }] },
    },
  });
  assert.match(r.location, /\?flag&tag=a&tag=b$|\?tag=a&tag=b&flag$/);
});

// --- The locale regex must not eat a same-prefixed marketing slug
test("/design is not mistaken for the /de locale prefix", () => {
  const r = run("/design");
  assert.equal(r.kind, "pass");
  assert.equal(r.uri, "/design/index.html");
});

test("/development/ (de-prefixed word) canonicalises as a bare page", () => {
  const r = run("/development/");
  assert.equal(r.kind, "redirect");
  assert.equal(r.location, abs("/development"));
});

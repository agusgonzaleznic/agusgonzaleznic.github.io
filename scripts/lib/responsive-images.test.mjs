import { test } from "node:test";
import assert from "node:assert/strict";
import { findResponsiveImageViolations } from "./responsive-images.mjs";

const SB = "https://a.storyblok.com/f/288632938663524/1600x900/abc/cover.jpg";
const SVG = "https://a.storyblok.com/f/288632938663524/375fba9742/x.svg";
const page = (html, path = "blog/a-post/index.html") => [{ path, html }];

test("a fully-attributed Storyblok image passes", () => {
  const html = `<img src="${SB}" srcset="${SB}/m/640x0 640w" sizes="100vw" width="1536" height="864" alt>`;
  assert.deepEqual(findResponsiveImageViolations(page(html)), []);
});

test("a bare Storyblok image is reported with every missing attribute", () => {
  const out = findResponsiveImageViolations(page(`<img src="${SB}" alt>`));
  assert.equal(out.length, 1);
  for (const a of ["srcset", "sizes", "width", "height"]) assert.match(out[0], new RegExp(a));
});

test("an UNSIZED asset is exempt from width/height but still needs srcset", () => {
  // SVGs in this space carry no WxH segment; guessing a ratio is worse than none.
  const out = findResponsiveImageViolations(page(`<img src="${SVG}" srcset="x 1w" sizes="100vw" alt>`));
  assert.deepEqual(out, []);
  const bare = findResponsiveImageViolations(page(`<img src="${SVG}" alt>`));
  assert.equal(bare.length, 1);
  assert.match(bare[0], /srcset, sizes/);
  assert.doesNotMatch(bare[0], /width/);
});

test("non-Storyblok images are ignored", () => {
  assert.deepEqual(findResponsiveImageViolations(page(`<img src="/profile.jpg" alt>`)), []);
});

test("only the blog subtree is checked", () => {
  const html = `<img src="${SB}" alt>`;
  assert.deepEqual(findResponsiveImageViolations([{ path: "about/index.html", html }]), []);
  assert.equal(findResponsiveImageViolations([{ path: "de/blog/x/index.html", html }]).length, 1);
  assert.equal(findResponsiveImageViolations([{ path: "blog/index.html", html }]).length, 1);
});

test("attributes are matched as TOKENS, so the serializer's quoting cannot fool it", () => {
  // beasties re-serializes: bare `alt`, lowercased `srcset`, and `>` not ` />`.
  const html = `<img src="${SB}" srcset="a 1w" sizes="100vw" width="1536" height="864" alt>`;
  assert.deepEqual(findResponsiveImageViolations(page(html)), []);
  // A substring that merely CONTAINS the name must not count as the attribute.
  const decoy = `<img src="${SB}" data-srcset="a 1w" data-sizes="x" alt>`;
  const out = findResponsiveImageViolations(page(decoy));
  assert.equal(out.length, 1, "data-srcset must not satisfy srcset");
});

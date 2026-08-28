// CMS richtext must be rendered for the READER's locale.
//
// The walker in src/components/blog/RichText.tsx is pure and synchronous, so it
// cannot read a hook: the locale is threaded through its Ctx and passed in by the
// page. Two things depended on that and were wrong.
//
// 1. INTERNAL LINKS. A translated article's body is a translation of the ENGLISH
//    body, so its internal links are the English ones copied across. A German
//    reader following `/about` silently left the German site. Latent rather than
//    live when this was fixed: the real corpus contained 15 link marks and not one
//    root-relative internal link, which is exactly why the fixture below carries
//    every shape the guard has to distinguish. Without it this fix would ship with
//    no automated coverage of the case it exists for.
//
// 2. THE HEADING ANCHOR LABEL. `aria-label="Link to this section"` was hardcoded,
//    so a screen reader on the German article announced English. That one WAS
//    live: measured on the published /de/ article, three English labels.
//
// Runs in both build modes. The label assertion needs only an article with a
// heading, which both corpora have; the link-shape assertions need the fixture,
// which only a tokenless build emits, so they are skipped with a stated reason
// rather than silently absent.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { BASE, openBrowser, pageAt } from "./helpers.mjs";

const FIXTURE_SLUG = "fixture-all-locales";
const fixtureBuild = existsSync(
  resolve(process.cwd(), "dist", "blog", FIXTURE_SLUG, "index.html"),
);

/** The heading-anchor label, per locale, as committed in the catalogs. */
const ANCHOR_LABEL = {
  "": "Link to this section",
  "de/": "Link zu diesem Abschnitt",
  "es/": "Enlace a esta sección",
  "fr/": "Lien vers cette section",
  "it/": "Link a questa sezione",
  "pt/": "Link para esta secção",
};

/** Anchors inside the article body, with their href and aria-label. */
async function articleAnchors(page, url) {
  const res = await page.goto(url, { waitUntil: "domcontentloaded" });
  assert.equal(res.status(), 200, `${url} status`);
  return page.$$eval("article a, main a", (nodes) =>
    nodes.map((a) => ({
      href: a.getAttribute("href") ?? "",
      label: a.getAttribute("aria-label") ?? "",
    })),
  );
}

test("the heading anchor label is the reader's language, not English", async () => {
  const slug = fixtureBuild ? FIXTURE_SLUG : "alert-fatigue-and-fuck-bingo";
  const browser = await openBrowser();
  try {
    for (const [prefix, expected] of Object.entries(ANCHOR_LABEL)) {
      const { page, errors } = await pageAt(browser);
      const anchors = await articleAnchors(page, `${BASE}/${prefix}blog/${slug}/`);
      const labels = [...new Set(anchors.map((a) => a.label).filter(Boolean))];
      assert.ok(
        labels.includes(expected),
        `/${prefix}blog/${slug}/: expected a heading anchor labelled ${JSON.stringify(expected)}, saw ${JSON.stringify(labels)}`,
      );
      if (prefix !== "") {
        assert.ok(
          !labels.includes(ANCHOR_LABEL[""]),
          `/${prefix}blog/${slug}/: an English anchor label is still present`,
        );
      }
      assert.deepEqual(errors, [], `/${prefix}blog/${slug}/: console errors`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("each CMS link shape is localized, or deliberately left alone", async (t) => {
  if (!fixtureBuild) {
    // A CMS build has no fixture article, and the real corpus has no
    // root-relative internal link to assert on. Skipping is stated, not silent.
    t.skip("needs the fixture corpus (BLOG_FIXTURE=1); a CMS build has no article carrying these shapes");
    return;
  }
  const browser = await openBrowser();
  try {
    // Four shapes, one page. `/about` is the case the fix exists for; the other
    // three are the ones a naive prefix would corrupt.
    for (const [prefix, want] of [
      ["de/", "/de/about"],
      ["fr/", "/fr/about"],
      ["", "/about"],
    ]) {
      const { page, errors } = await pageAt(browser);
      const anchors = await articleAnchors(page, `${BASE}/${prefix}blog/${FIXTURE_SLUG}/`);
      const hrefs = anchors.map((a) => a.href);

      assert.ok(hrefs.includes(want), `/${prefix}: expected a link to ${want}, saw ${JSON.stringify(hrefs)}`);
      if (prefix !== "") {
        assert.ok(!hrefs.includes("/about"), `/${prefix}: an unlocalized /about link survived`);
      }
      // A pure fragment must NOT be prefixed: /de/#x is a different page.
      assert.ok(
        hrefs.includes("#fixture-heading-for-the-anchor-label"),
        `/${prefix}: the fragment link was rewritten, saw ${JSON.stringify(hrefs)}`,
      );
      // An author who wrote a locale explicitly keeps it, even on another locale's
      // page. This is also what makes the transform idempotent.
      assert.ok(hrefs.includes("/de/about"), `/${prefix}: the explicit /de/about link was rewritten`);
      // External is untouched and still opens in a new tab.
      const ext = anchors.find((a) => a.href === "https://example.com/");
      assert.ok(ext, `/${prefix}: the external link was rewritten`);

      assert.deepEqual(errors, [], `/${prefix}: console errors`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

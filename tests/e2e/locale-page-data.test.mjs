// The active locale's CMS page data must reach the client, and only that locale's.
//
// WHY THIS FILE EXISTS. src/lib/pages.ts used to import all six locales'
// marketing-page JSON with an eager glob. Because that module is reachable from
// the eager Index route, every one of the 85 prerendered pages downloaded all six
// on the render-blocking path: 108,186 of the entry chunk's 271,128 characters,
// about 25 kB of its gzip, to read one of them. It now loads exactly the locale
// the URL implies, in parallel with the Lingui catalog that main.tsx already
// awaits before hydrating.
//
// That trade has one failure mode, and it is silent. If the per-locale chunk does
// not load, getPageContent returns null and every section falls back to its
// hardcoded copy, which is BY DESIGN indistinguishable at a glance: the CMS was
// seeded from those same strings. So a broken loader would look like a working
// site while quietly serving stale copy that no editor can change.
//
// The discriminator is a string the CMS has and the fallback does not. The
// /impact timeline names the employer "Safe Labs GmbH (Web3)" in Storyblok, while
// src/components/Impact.tsx still says "Safe Labs GmbH". If the CMS data is live
// the parenthetical is there; if the page fell back it is not. The assertion runs
// after hydration settles, which is the only moment that can catch React
// replacing server markup with fallback copy.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BASE, openBrowser, pageAt } from "./helpers.mjs";

// `document` below appears only inside page.evaluate/waitForFunction callbacks,
// which are serialised and run in the BROWSER. eslint reads this file as node
// code, so without this it reports no-undef and `npm run lint`, which CI runs
// with --max-warnings 0, fails on a correct file. Same reason as helpers.mjs.
/* global document */

/** CMS-only: present iff getPageContent() answered from Storyblok data. */
const CMS_ONLY = "Safe Labs GmbH (Web3)";
/** What the hardcoded fallback renders instead. */
const FALLBACK_ONLY = "Safe Labs GmbH";

// Directory form throughout: `vite preview` serves the English SPA shell with a
// 200 for any clean extensionless path, so /de/impact would test the fallback
// shell rather than the prerendered German document.
const LOCALES = ["", "de/", "es/", "fr/", "it/", "pt/"];

test("every locale's /impact serves CMS data, and still does after hydration", async () => {
  const browser = await openBrowser();
  try {
    for (const prefix of LOCALES) {
      const url = `${BASE}/${prefix}impact/`;
      const { page, errors } = await pageAt(browser);

      // 1. The prerendered document itself.
      const res = await page.goto(url, { waitUntil: "networkidle" });
      assert.equal(res.status(), 200, `${url} status`);
      const served = await res.text();
      assert.ok(served.includes(CMS_ONLY), `${url}: prerendered HTML lacks the CMS value`);

      // 2. After hydration. waitForFunction rather than a fixed delay: React
      //    replaces the tree in a microtask we cannot time, and a sleep here
      //    would pass on a fast machine and flake on a slow one.
      await page.waitForFunction(
        (needle) => document.body.innerText.includes(needle),
        CMS_ONLY,
        { timeout: 10000 },
      );
      // 3. And it is still there once the event loop has drained, which is when a
      //    late fallback render would land.
      await page.waitForTimeout(300);
      const text = await page.evaluate(() => document.body.innerText);
      assert.ok(
        text.includes(CMS_ONLY),
        `${url}: hydration replaced CMS copy with the hardcoded fallback`,
      );
      // The fallback string is a prefix of the CMS one, so only its bare form is
      // evidence of a fallback render.
      const bare = text.split(CMS_ONLY).join("");
      assert.ok(
        !bare.includes(FALLBACK_ONLY),
        `${url}: a fallback-rendered timeline entry is also present`,
      );

      assert.deepEqual(errors, [], `${url}: console/hydration errors`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("the entry chunk carries no locale page data", async () => {
  // The regression this whole change exists to prevent. Asserted on the artifact
  // rather than on the source, because an eager glob reintroduced anywhere in the
  // entry graph would put the JSON back without touching pages.ts.
  const assets = resolve(process.cwd(), "dist", "assets");
  const entry = readdirSync(assets).filter((f) => /^index-.*\.js$/.test(f));
  assert.ok(entry.length >= 1, "no entry chunk found in dist/assets");
  const biggest = entry
    .map((f) => ({ f, size: readFileSync(resolve(assets, f)).length }))
    .sort((a, b) => b.size - a.size)[0];
  const js = readFileSync(resolve(assets, biggest.f), "utf8");

  // Assert on the DATA, not on the filename: Vite emits the candidate specifiers
  // for a dynamic import with a variable path, so `page-data.de.json` appearing as
  // an import specifier is correct and expected. What must NOT appear is the
  // localized COPY itself.
  const generated = resolve(process.cwd(), "src", "generated");
  for (const locale of ["de", "es", "fr", "it", "pt"]) {
    const data = JSON.parse(readFileSync(resolve(generated, `page-data.${locale}.json`), "utf8"));
    // The longest string in that locale's data: distinctive, and present only if
    // the array itself was inlined.
    const strings = [];
    const walk = (o) => {
      if (typeof o === "string") strings.push(o);
      else if (Array.isArray(o)) o.forEach(walk);
      else if (o && typeof o === "object") Object.values(o).forEach(walk);
    };
    walk(data);
    const longest = strings.sort((a, b) => b.length - a.length)[0];
    assert.ok(longest && longest.length > 40, `${locale}: no distinctive string to test with`);
    assert.ok(
      !js.includes(longest),
      `${biggest.f} still inlines ${locale} page copy: ${longest.slice(0, 60)}`,
    );
  }

  // And the per-locale chunks must actually exist, or the loader has nothing to
  // fetch and every locale silently falls back.
  const chunks = readdirSync(assets).filter((f) => /^page-data\..*\.js$/.test(f));
  assert.equal(chunks.length, 5, `expected 5 per-locale chunks, got ${chunks.length}`);
});

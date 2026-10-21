// The active locale's marketing-page data must reach the client, and only that
// locale's. Asserted in BOTH build modes, because they are genuinely different
// artifacts and each has its own correct answer.
//
// WHY THIS FILE EXISTS. src/lib/pages.ts used to import all six locales'
// marketing-page JSON with an eager glob. Because that module is reachable from
// the eager Index route, every one of the 85 prerendered pages downloaded all six
// on the render-blocking path: 108,186 of the entry chunk's 271,128 characters,
// about 25 kB of its gzip, to read one of them. It now loads exactly the locale
// the URL implies, in parallel with the Lingui catalog that main.tsx already
// awaited before hydrating, and prerender hints both chunks so neither is a
// serial third hop.
//
// THE FAILURE MODE IS SILENT, which is the reason for the CMS-only discriminator
// below. If the per-locale chunk does not load, getPageContent returns null and
// every section falls back to its hardcoded copy, which is BY DESIGN
// indistinguishable at a glance: the CMS was seeded from those same strings. So a
// broken loader looks like a working site while serving copy no editor can change.
//
// TWO BUILD MODES, and conflating them is how the last change broke CI:
//
//   CMS build (a Storyblok token present, which is what deploy.yml runs): five
//   page-data chunks, and /impact names the employer "Safe Labs GmbH (Web3)",
//   a string that exists ONLY in the CMS.
//
//   Tokenless build (`BLOG_FIXTURE=1 npm run build` with no token, which is what
//   PR CI runs, deliberately, so a PR needs no secrets): fetch-pages writes empty
//   page data on purpose, Vite emits NO page-data chunk, and every locale renders
//   its hardcoded fallback, where src/components/Impact.tsx says plain
//   "Safe Labs GmbH". That path is a real production path too, since it is what
//   renders if the CMS is unreachable at build time, and until now nothing had
//   ever exercised it in a browser.
//
// Both modes therefore get a real assertion. Neither is skipped, because a
// skipped test in the mode CI actually runs is not a test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BASE, openBrowser, pageAt, waitForHydration } from "./helpers.mjs";

// `document` appears only inside page.evaluate/waitForFunction callbacks, which
// are serialised and run in the BROWSER. eslint reads this file as node code, so
// without this it reports no-undef and `npm run lint` fails on a correct file.
/* global document */

/** Present iff getPageContent() answered from Storyblok data. */
const CMS_ONLY = "Safe Labs GmbH (Web3)";
/** What src/components/Impact.tsx renders when it falls back. */
const FALLBACK_ONLY = "Safe Labs GmbH";

// Directory form throughout: `vite preview` serves the English SPA shell with a
// 200 for any clean extensionless path, so /de/impact would test that shell
// rather than the prerendered German document.
const LOCALES = ["", "de/", "es/", "fr/", "it/", "pt/"];
const PREFIXED = LOCALES.filter((p) => p !== "");

const assetsDir = resolve(process.cwd(), "dist", "assets");
const assets = readdirSync(assetsDir);
const pageDataChunks = assets.filter((f) => /^page-data\..*\.js$/.test(f));
const catalogChunks = assets.filter((f) => /^(de|es|fr|it|pt)-[A-Za-z0-9_-]{8}\.js$/.test(f));
const cmsBuild = pageDataChunks.length > 0;

// Printed on purpose. The two modes assert DIFFERENT things, and CI can only ever
// run the tokenless one (no Storyblok token on a pull request), so a green tick
// alone does not say which set was measured. See the note in ci.yml.
console.log(
  `  locale-page-data: ${cmsBuild ? "CMS" : "TOKENLESS"} build detected ` +
    `(${pageDataChunks.length} page-data chunk(s), ${catalogChunks.length} catalog chunk(s))`,
);

/** The largest entry chunk, which is the one every prerendered page loads. */
function entryChunk() {
  const entries = assets
    .filter((f) => /^index-.*\.js$/.test(f))
    .map((f) => ({ f, size: readFileSync(resolve(assetsDir, f)).length }))
    .sort((a, b) => b.size - a.size);
  assert.ok(entries.length >= 1, "no entry chunk found in dist/assets");
  return { name: entries[0].f, js: readFileSync(resolve(assetsDir, entries[0].f), "utf8") };
}

// ------------------------------------------------------------ artifact shape

test("the page-data chunk set is all or nothing, never partial", () => {
  // A partial set is the dangerous state: it means some locales silently lost
  // their data while others kept it, which reads as a working site.
  assert.ok(
    pageDataChunks.length === 0 || pageDataChunks.length === PREFIXED.length,
    `expected 0 or ${PREFIXED.length} page-data chunks, found ${pageDataChunks.length}: ` +
      pageDataChunks.join(", "),
  );
  // The catalogs are committed, so they are emitted in every build mode.
  assert.equal(
    catalogChunks.length,
    PREFIXED.length,
    `expected one Lingui catalog chunk per prefixed locale, found ${catalogChunks.join(", ")}`,
  );
});

test("the entry chunk carries no locale page data", () => {
  // The regression the whole change exists to prevent. Asserted on the artifact
  // rather than the source, because an eager glob reintroduced anywhere in the
  // entry graph would put the JSON back without touching pages.ts.
  const { name, js } = entryChunk();
  if (!cmsBuild) {
    // Nothing to inline in this mode, so the meaningful check is the catalog
    // split: a German string must live in de-*.js, never in the shared entry.
    const de = readFileSync(resolve(process.cwd(), "src/i18n/catalogs/de.po"), "utf8");
    const long = [...de.matchAll(/^msgstr "(.{60,})"$/gm)].map((m) => m[1]);
    assert.ok(long.length > 0, "no long German msgstr to test with");
    assert.ok(
      !js.includes(long[0].slice(0, 50)),
      `${name} inlines German catalog copy: ${long[0].slice(0, 60)}`,
    );
    return;
  }
  const generated = resolve(process.cwd(), "src", "generated");
  for (const locale of PREFIXED.map((p) => p.replace("/", ""))) {
    const data = JSON.parse(readFileSync(resolve(generated, `page-data.${locale}.json`), "utf8"));
    const strings = [];
    const walk = (o) => {
      if (typeof o === "string") strings.push(o);
      else if (Array.isArray(o)) o.forEach(walk);
      else if (o && typeof o === "object") Object.values(o).forEach(walk);
    };
    walk(data);
    const longest = strings.sort((a, b) => b.length - a.length)[0];
    assert.ok(longest && longest.length > 40, `${locale}: no distinctive string to test with`);
    assert.ok(!js.includes(longest), `${name} still inlines ${locale} page copy`);
  }
});

test("the client-reachable loader does not eager-glob locale data", () => {
  // The artifact test above can only prove this in a CMS build, and CI is
  // tokenless BY DESIGN, so in CI there is no locale JSON to catch inlined. This
  // asserts the same regression at the source, where it is visible in every mode:
  // an eager glob in this module puts all six locales back into the entry chunk,
  // because it is reachable from the eager Index route.
  //
  // src/entry-server.tsx DOES eager-glob on purpose and is excluded: it is the
  // server bundle, renderToString is synchronous, and nothing it contains ships
  // to a reader.
  const raw = readFileSync(resolve(process.cwd(), "src", "lib", "pages.ts"), "utf8");
  // Strip comments first. The module's own note EXPLAINS what it used to do and
  // names the call, so matching raw text flags the documentation as the defect.
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
  assert.ok(
    !/import\.meta\.glob/.test(src),
    "src/lib/pages.ts uses import.meta.glob again; an eager glob here returns all " +
      "six locales' page JSON to the entry chunk that all 85 pages load",
  );
  assert.match(
    src,
    /await import\(`\.\.\/generated\/page-data\.\$\{locale\}\.json`\)/,
    "src/lib/pages.ts no longer dynamically imports one locale's page data",
  );
});

// ------------------------------------------------------------- preload hints

test("a prefixed page hints exactly the chunks it needs, after the fonts", async () => {
  // Placement is the point: a modulepreload is fetched at High priority, so
  // putting these ahead of the font preloads would contend with the text render
  // that is the LCP element. The count differs by mode, the ordering never does.
  const want = cmsBuild ? 2 : 1;
  const browser = await openBrowser();
  try {
    for (const prefix of PREFIXED) {
      const { page } = await pageAt(browser);
      const res = await page.goto(`${BASE}/${prefix}impact/`, { waitUntil: "domcontentloaded" });
      const html = await res.text();
      const fonts = [...html.matchAll(/rel="preload" as="font"/g)].map((m) => m.index);
      const mine = [...html.matchAll(/rel="modulepreload"[^>]*href="([^"]+)"/g)]
        .filter((m) => /\/(de|es|fr|it|pt)-|page-data\./.test(m[1]));
      assert.equal(mine.length, want, `/${prefix}impact/: expected ${want} locale hint(s)`);
      // Each hint must be for THIS locale. Counting alone would pass if
      // injectLocalePreloads were called with a constant, so every prefixed page
      // hinted the German pair: the count and the ordering would both still hold,
      // and a wrong modulepreload costs a wasted download and logs nothing.
      const loc = prefix.replace("/", "");
      for (const m of mine) {
        assert.match(
          m[1],
          new RegExp(`^/assets/(page-data\\.)?${loc}-`),
          `/${prefix}impact/: hint ${m[1]} is not this locale's chunk`,
        );
      }
      assert.ok(fonts.length === 3, `/${prefix}impact/: expected 3 font preloads, got ${fonts.length}`);
      for (const m of mine) {
        assert.ok(
          m.index > Math.max(...fonts),
          `/${prefix}impact/: a locale hint precedes a font preload, which is the LCP risk`,
        );
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("english hints no locale chunk, because its catalog is in the entry chunk", async () => {
  const browser = await openBrowser();
  try {
    const { page } = await pageAt(browser);
    const res = await page.goto(`${BASE}/impact/`, { waitUntil: "domcontentloaded" });
    const html = await res.text();
    // Anchor the negative assertion to the right document first. `vite preview`
    // answers any clean path with the English SPA shell and a 200, so a missing
    // dist/impact/index.html would also "hint no locale chunk", and so would a
    // broken filter regex below.
    assert.equal(res.status(), 200, "/impact/ status");
    assert.ok(
      html.includes(cmsBuild ? CMS_ONLY : FALLBACK_ONLY),
      "/impact/ is not the prerendered impact document",
    );
    const mine = [...html.matchAll(/rel="modulepreload"[^>]*href="([^"]+)"/g)]
      .filter((m) => /\/(de|es|fr|it|pt)-|page-data\./.test(m[1]));
    assert.deepEqual(mine.map((m) => m[1]), [], "/impact/ should hint no locale chunk");
    await page.close();
  } finally {
    await browser.close();
  }
});

// --------------------------------------------------- the copy actually served

test("every locale serves the right copy, and still does after hydration", async () => {
  // The assertion that catches a broken loader. In a CMS build the CMS-only
  // string must survive hydration; in a tokenless build the fallback must, which
  // is the first browser coverage the fallback path has ever had.
  const expected = cmsBuild ? CMS_ONLY : FALLBACK_ONLY;
  const browser = await openBrowser();
  try {
    for (const prefix of LOCALES) {
      const url = `${BASE}/${prefix}impact/`;
      const { page, errors } = await pageAt(browser);
      const res = await page.goto(url, { waitUntil: "networkidle" });
      assert.equal(res.status(), 200, `${url} status`);
      assert.ok((await res.text()).includes(expected), `${url}: prerendered HTML lacks ${expected}`);

      // HYDRATION FIRST, and this is the load-bearing line. Everything below reads
      // the DOM, and the prerendered DOM ALREADY contains the expected string, so
      // without this the test passes with the entry chunk never delivered and React
      // never running: measured, by destroying the socket for /assets/index-*.js.
      // A test whose premise is "did the client-side loader run" has to prove the
      // client ran before it believes anything on screen.
      await waitForHydration(page);

      // waitForFunction, not a sleep: React replaces the tree in a microtask we
      // cannot time, and a fixed delay passes on a fast machine and flakes on a
      // slow one.
      await page.waitForFunction(
        (needle) => document.body.innerText.includes(needle),
        expected,
        { timeout: 15000 },
      );
      // Still there once the event loop has drained, which is when a late
      // fallback render would land.
      await page.waitForTimeout(300);
      const text = await page.evaluate(() => document.body.innerText);
      assert.ok(text.includes(expected), `${url}: hydration replaced the copy it rendered`);
      if (cmsBuild) {
        // FALLBACK_ONLY is a prefix of CMS_ONLY, so only its bare form is
        // evidence that a section fell back while others did not.
        const bare = text.split(CMS_ONLY).join("");
        assert.ok(!bare.includes(FALLBACK_ONLY), `${url}: a fallback-rendered entry is also present`);
      } else {
        assert.ok(!text.includes(CMS_ONLY), `${url}: CMS copy in a tokenless build`);
      }
      assert.deepEqual(errors, [], `${url}: console/hydration errors`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

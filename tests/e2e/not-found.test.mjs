// End-to-end spec for unknown-path behaviour: what a visitor and a crawler get
// when they ask for a URL this site does not have.
//
// =============================================================================
// THE HTTP STATUS CODE IS DELIBERATELY NOT ASSERTED HERE.
// Read this before "helpfully" adding `assert.equal(res.status, 404)`.
//
// Production returns a REAL 404 for an unknown path. CloudFront's
// `custom_error_response` maps 404 -> /404.html with `response_code = 404`
// (terraform/cdn.tf, around the "Unknown paths return a REAL 404" comment), and
// GitHub Pages serves 404.html natively. There is deliberately NO SPA
// 200-fallback: a 200 on a URL that does not exist is the soft-404 that gets
// pages misfiled in Search Console.
//
// The LOCAL preview server does the exact opposite. `vite preview` applies an
// SPA fallback, so a junk path answers 200 with a body that is byte-identical to
// dist/index.html (measured: /not-a-page and dist/index.html are both 40796
// bytes). A status assertion in this file would fail for a reason that is not a
// bug, and the tempting repair is to weaken it into something that can never
// fail at all.
//
// So the status is verified in the two places where it can be verified honestly:
//   - the CONFIG: terraform/cdn.tf, `custom_error_response`;
//   - a LIVE probe: .github/workflows/synthetic.yml curls
//     /synthetic-404-probe-$RANDOM against the real origin twice a day and fails
//     with "the SPA fallback has returned and will produce soft-404s".
// docs/architecture.md ("Real 404s, no SPA 200-fallback") is the write-up.
//
// What THIS file owns is everything about that response that is true locally:
// the markup a crawler reads out of dist/404.html, and what the client does with
// an unknown path once it runs.
// =============================================================================
//
// WHAT THE BUILD ALREADY ASSERTS, so it is not repeated below. scripts/
// prerender.mjs fails the build if 404.html renders an empty <title>
// (injectRouteHead), and its assertNoBrokenInternalLinks walks 404.html
// specifically (see the "a deliberately broken link planted on the 404 page"
// note) so every href on the page is known to exist as a built file. The gaps
// this file fills: the noindex/canonical/hreflang head contract on 404.html,
// the sitemap's silence about it, and every client-side behaviour, none of which
// the build looks at.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { BASE, openBrowser, pageAt, markSpa, stayedSpa } from "./helpers.mjs";

// The waitForFunction callback below is serialised and runs in the BROWSER.
// eslint.config.js gives **/*.mjs node globals only, so a bare browser global is
// a no-undef and `npm run lint` (which CI runs with --max-warnings 0) fails on a
// correct file. Same directive as the sibling specs.
/* global document */

let browser;

before(async () => {
  browser = await openBrowser();
});

after(async () => {
  await browser?.close();
});

/**
 * Every `content` of a <meta name="robots"> tag, in document order.
 *
 * Parsing the tags instead of grepping the HTML for "noindex" is not
 * fastidiousness: index.html carries a prose comment that contains the word
 * noindex ("Only /404.html carries a robots tag of its own..."), so a substring
 * test passes on the HOMEPAGE too. Measured: `grep -c noindex dist/index.html`
 * is 1, and this function returns ["index, follow, ..."] for the same file. The
 * whole point of the assertion is to tell the 404 document apart from the
 * homepage shell, which is exactly what the substring version cannot do.
 */
function robotsDirectives(html) {
  return [...html.matchAll(/<meta\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => /name=["']robots["']/i.test(tag))
    .map((tag) => tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "");
}

/**
 * Open `path` and wait until the NotFound view is HYDRATED and on screen.
 *
 * Two waits in one, and both are load-bearing:
 *
 *   - the React fiber key on #root's first element child. This waits on
 *     hydration itself rather than on a network heuristic like networkidle.
 *     Verified to discriminate: with `page.route` aborting the built JS assets,
 *     the probe stays false while the prerendered h1 is already on screen, and
 *     it flips true once the entry chunk is allowed through.
 *   - `main` starting with the "404" numeral. On a junk path the local server
 *     hands over the HOMEPAGE shell first, so "an <h1> exists in main" is true
 *     before NotFound has rendered anything. The numeral is the view's own
 *     marker and is not translated, so it works for /de/ too. Measured: true on
 *     /404.html, /not-a-page and /de/not-a-page, false on / and /about.
 */
async function openNotFound(path) {
  const { page, errors } = await pageAt(browser);
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => {
      // globalThis.document, not a bare `document`: eslint.config.js gives
      // **/*.mjs `globals.node` only, so a bare browser global is a no-undef
      // error under `npm run lint` (which CI runs with --max-warnings 0), and
      // flat config dropped `/* eslint-env browser */`. globalThis is a plain
      // ES builtin, so this reads identically in the page and lints clean here.
      const doc = globalThis.document;
      const root = doc.querySelector("#root")?.firstElementChild;
      if (!root || !Object.keys(root).some((k) => k.startsWith("__reactFiber$"))) return false;
      const main = doc.querySelector("main");
      return !!main && main.textContent.trimStart().startsWith("404");
    },
    null,
    { timeout: 15000 },
  );
  return { page, errors };
}

/** The hrefs of every link inside <main>, i.e. the NotFound view's own links. */
const mainHrefs = (page) =>
  page.$$eval("main a", (as) => as.map((a) => a.getAttribute("href")));

// --- what the client does with an unknown path --------------------------------

test("an unknown path renders the NotFound view, not the homepage", async () => {
  const { page } = await openNotFound("/not-a-page");

  assert.equal(await page.textContent("main h1"), "This page doesn't exist");

  // The title is asserted because on this server it starts out WRONG: the SPA
  // fallback served the homepage document, so the <title> in the delivered HTML
  // is the homepage's until react-helmet rewrites it client-side. That rewrite
  // is what a JS-executing crawler and a browser tab read on a junk URL, and
  // nothing else covers it. Matched as a prefix rather than compared to the full
  // string so a copy edit to the suffix is not a test failure.
  // WAIT for that rewrite instead of sampling once. The rewrite happens AFTER
  // hydration, so a single read is a race: this assertion passed on one run and
  // failed on the next with the homepage title still in place. The h1 above had
  // already rendered, which is what proves the view mounted and only the head
  // lagged. A flaky test is worse than no test, hence the explicit wait.
  await page
    .waitForFunction(() => document.title.startsWith("Page not found"), null, { timeout: 5000 })
    .catch(() => {
      throw new Error(
        "react-helmet never rewrote the title on a junk URL; it stayed at the served homepage title",
      );
    });
  const title = await page.title();
  assert.match(title, /^Page not found\b/);
  assert.doesNotMatch(title, /Engineering Leadership Coach$/);

  await page.close();
});

test("the NotFound view sends a dead-end visitor back in, client-side", async () => {
  const { page } = await openNotFound("/not-a-page");

  // The primary CTA is first in <main>. Root-relative and locale-aware: see the
  // /de/ test below for the half of this contract that can actually regress.
  const hrefs = await mainHrefs(page);
  assert.equal(hrefs[0], "/");
  assert.ok(hrefs.length >= 2, `expected exit links on the 404 page, got ${hrefs.length}`);

  // Take the destination from the DOM rather than hardcoding /about, so
  // reordering the shortcut list is not a failure. Measured today: /about.
  const target = await page.getAttribute("main nav ul li a", "href");
  assert.match(target, /^\//);

  await markSpa(page);
  await page.click("main nav ul li a");
  await page.waitForURL((url) => url.pathname === target, { timeout: 10000 });

  // 1. It is a CLIENT-SIDE navigation. Without markSpa/stayedSpa this whole test
  //    passes even if <LocaleLink> degrades to a plain <a>, because the
  //    destination is prerendered and looks identical after a full reload.
  //    Verified to discriminate: replacing the click with a real page.goto
  //    (a genuine document load) makes stayedSpa return false.
  assert.equal(await stayedSpa(page), true, "the exit link did a full page reload");

  // 2. It landed on a real page and not on another 404. The build checks that
  //    the href exists as a FILE; it cannot check that the client ROUTER has a
  //    matching route, and those are separate lists (scripts/prerender.mjs's
  //    `routes` vs App.tsx's <Route> table). A path present in dist but absent
  //    from the route table serves fine on a direct hit and falls through to the
  //    catch-all "*" on a client-side click, which is precisely this assertion.
  // Wait for the CONTENT, not just the URL. react-router pushes the new path
  // before the lazy() destination has rendered, so `main` can still hold the 404
  // view for a beat. Same race as the /de/ test below: it passed under the local
  // Chrome and flaked under the bundled chromium CI uses. The catch is deliberate,
  // so a real regression fails on the readable assertion rather than a timeout.
  await page
    .waitForFunction(
      () => {
        // POSITIVE predicate. `!text.startsWith("404")` alone is satisfied by a
        // MISSING or EMPTY main, so it can return inside the very Suspense gap it
        // was added to wait past, and the assertion below then reads that same
        // blank. Require real content first, then require it not to be the 404.
        const text = (document.querySelector("main")?.innerText ?? "").trim();
        return text.length > 0 && !text.startsWith("404");
      },
      { timeout: 10000 },
    )
    .catch(() => {});
  const mainText = await page.textContent("main");
  assert.ok(mainText.trim().length > 0, `client navigation to ${target} left main empty`);
  assert.ok(
    !mainText.trimStart().startsWith("404"),
    `client navigation to ${target} landed on the 404 view again`,
  );

  await page.close();
});

test("the NotFound route hydrates with no console errors", async () => {
  // WHY THIS ROUTE AND NOT THE JUNK PATH. This is measured on /404.html, the
  // document production actually serves for an unknown URL. On /not-a-page the
  // local server serves the HOMEPAGE shell and the client then renders NotFound
  // over it, which is a hydration mismatch by construction: measured 6x React
  // error #418 (text content mismatch) plus one #422 (root fell back to client
  // rendering) on both /not-a-page and /de/not-a-page. That is an artifact of
  // `vite preview`'s SPA fallback, not a production defect, since production
  // serves 404.html whose markup IS the NotFound view. Asserting zero on the
  // junk path would fail for the wrong reason.
  //
  // HOW FAR THIS REACHES, stated plainly so nobody over-reads a green run:
  // vite.config.ts builds with terser `drop_console: true`, so app-level
  // console.* calls are stripped from the bundle. NotFound's own deliberate
  // console.error ("404 Error: User attempted to access non-existent route")
  // therefore never reaches the collector, and neither would a new one. What
  // this DOES catch is uncaught exceptions and React's own diagnostics, which
  // the production build throws rather than logs, hydration mismatches included.
  // That is the failure this route cares about most: it is the one page a
  // crawler is most likely to reach, and the fiber wait above proves hydration
  // ran before we look.
  const { page, errors } = await openNotFound("/404.html");
  assert.deepEqual(errors, []);
  await page.close();
});

// --- the SEO contract that lives in the markup --------------------------------

test("the prerendered 404 document is readable and noindex with no JavaScript", async () => {
  // Fetched with plain fetch, no browser: that IS the assertion. A crawler that
  // does not run JS must get the whole page and the noindex out of the bytes.
  const res = await fetch(`${BASE}/404.html`);
  assert.equal(res.ok, true);
  const html = await res.text();

  // The view is in the delivered markup, not painted by the client.
  assert.match(html, /This page doesn&#x27;t exist|This page doesn't exist/);

  // noindex is the whole reason this page can exist without polluting the index.
  // Nothing in the build checks it: prerender.mjs's sitemap walk only collects
  // files named index.html, so 404.html never reaches its noindex branch.
  const robots = robotsDirectives(html);
  assert.ok(
    robots.some((c) => /\bnoindex\b/i.test(c)),
    `no robots meta asked for noindex, got ${JSON.stringify(robots)}`,
  );
  // Two robots tags ship on this page: the route-agnostic "index, follow, ..."
  // from index.html's head and NotFound's helmet "noindex, follow". Google
  // resolves conflicting robots meta to the most restrictive, which is why the
  // pair is accepted rather than asserted away. Measured on the built file:
  // ["index, follow, max-image-preview:large, ...", "noindex, follow"].

  // No canonical. A canonical on a dead URL invites a crawler to consolidate it
  // into a live page instead of dropping it, and it is also the sharpest signal
  // that prerender's head splice ran at all: index.html's template head
  // canonicalizes to the site root, so this assertion fails the moment 404.html
  // starts being (or being replaced by) the homepage shell. Measured: / and
  // /about both carry one, 404.html carries none.
  assert.doesNotMatch(html, /rel="canonical"/);

  // No hreflang alternates. There is no "this page in German" for a URL that
  // does not exist. Every other page carries a full six-locale set, so this too
  // fails if the 404 head ever turns into a normal route's head.
  assert.doesNotMatch(html, /rel="alternate"/);
});

test("the 404 page is not advertised in the sitemap", async () => {
  // The build asserts the forward direction (every indexable page it emitted is
  // listed). Nobody asserts the reverse, and listing a noindex URL is its own
  // Search Console error bucket ("Submitted URL marked noindex").
  const res = await fetch(`${BASE}/sitemap.xml`);
  assert.equal(res.ok, true);
  const locs = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  // Guard against the vacuous pass: an empty or missing sitemap would satisfy
  // the real assertion trivially. Measured today: 84 entries.
  assert.ok(locs.length > 50, `sitemap looks empty or truncated (${locs.length} entries)`);
  assert.deepEqual(
    locs.filter((l) => /404/.test(l)),
    [],
  );
});

// --- the locale case ----------------------------------------------------------

test("an unknown path under a locale prefix keeps the locale", async () => {
  const en = await openNotFound("/not-a-page");
  const de = await openNotFound("/de/not-a-page");

  const [enH1, deH1] = [await en.page.textContent("main h1"), await de.page.textContent("main h1")];
  // Both titles have to be WAITED for, not sampled, and for a subtler reason than
  // the English test above. This server answers /de/not-a-page with the ROOT
  // document, so BOTH pages start life carrying the same English homepage title.
  // Sampling once can therefore catch them before either rewrite lands, at which
  // point the two are equal and the inequality assertion below fails for a reason
  // that has nothing to do with the locale. Wait for the English rewrite first,
  // then wait for the German one to diverge from it.
  await en.page.waitForFunction(() => document.title.startsWith("Page not found"), null, {
    timeout: 5000,
  });
  const enTitle = await en.page.title();
  await de.page
    .waitForFunction((t) => document.title !== t && document.title.length > 0, enTitle, {
      timeout: 5000,
    })
    .catch(() => {
      throw new Error(
        "the /de/ 404 title never diverged from the English one, so the locale was not activated",
      );
    });
  const deTitle = await de.page.title();

  // Compared against the English render rather than pinned to a German string,
  // so a translator rewording the copy is not a test failure. What it catches is
  // the locale not being activated at all, which is the real regression: on this
  // path the delivered document is the ENGLISH shell, and only main.tsx's
  // dynamicActivate(localeFromPath(...)) before hydrate makes it German.
  assert.notEqual(deH1, enH1, "the /de/ 404 rendered the English heading");
  assert.notEqual(deTitle, enTitle, "the /de/ 404 rendered the English title");
  // ...and it is a translated sentence, not a raw Lingui message id leaking
  // through (a <Trans> missing from the catalogs renders its id, e.g. "s3qJ3e",
  // because @lingui/swc-plugin strips the fallback text: see the i18n:check note
  // in .github/workflows/ci.yml, which found exactly that in dist/404.html).
  assert.match(deH1, /\p{L}+\s+\p{L}+/u, `not a translated sentence: ${JSON.stringify(deH1)}`);

  // Every exit link keeps the reader in German, the CTA included. Without this,
  // a German visitor who mistypes a URL is silently dropped back onto the
  // English site. Measured: ["/de/", "/de/about", "/de/services", "/de/blog/",
  // "/de/contact"], and ["/", "/about", ...] on the English page, so a
  // regression in <LocaleLink>/useLocalizedTo flips this assertion.
  const deHrefs = await mainHrefs(de.page);
  assert.equal(deHrefs[0], "/de/");
  for (const href of deHrefs) {
    assert.ok(href.startsWith("/de/"), `exit link dropped the locale: ${href}`);
  }

  // And the client-side navigation stays inside the locale.
  const target = await de.page.getAttribute("main nav ul li a", "href");
  await markSpa(de.page);
  await de.page.click("main nav ul li a");
  await de.page.waitForURL((url) => url.pathname === target, { timeout: 10000 });
  // The URL is NOT the finish line. react-router pushes the new path immediately,
  // but the destination component is lazy() behind Suspense, so `main` can still
  // hold the 404 view for a beat afterwards. Waiting only on the URL made the
  // assertion below a race: it passed under the locally installed Chrome and
  // failed 2 runs in 3 under Playwright's bundled chromium, which is what CI
  // uses. Wait for the CONTENT, which is what the assertion is about.
  //
  // The catch is deliberate: on a real regression this wait times out, and the
  // assertion below then produces the readable message instead of a bare timeout.
  await de.page
    .waitForFunction(
      () => {
        // POSITIVE predicate. `!text.startsWith("404")` alone is satisfied by a
        // MISSING or EMPTY main, so it can return inside the very Suspense gap it
        // was added to wait past, and the assertion below then reads that same
        // blank. Require real content first, then require it not to be the 404.
        const text = (document.querySelector("main")?.innerText ?? "").trim();
        return text.length > 0 && !text.startsWith("404");
      },
      { timeout: 10000 },
    )
    .catch(() => {});
  assert.equal(await stayedSpa(de.page), true, "the localized exit link did a full page reload");
  const deMain = await de.page.textContent("main");
  assert.ok(deMain.trim().length > 0, `client navigation to ${target} left main empty`);
  assert.ok(
    !deMain.trimStart().startsWith("404"),
    `client navigation to ${target} landed on the 404 view again`,
  );

  // NOT ASSERTED, on purpose: <html lang>. Measured on /de/not-a-page it stays
  // "en" while the visible copy is German, and that is NOT a local-server
  // artifact. Production serves ONE dist/404.html, prerendered in the source
  // locale with lang="en", for every locale's unknown paths; nothing updates the
  // attribute afterwards (only LanguageSwitcher's switchTo does, and only on a
  // click). Asserting "de" would fail against correct-as-built output; asserting
  // "en" would pin a defect and make the fix look like a regression. It is
  // reported instead: mislabelled language is an accessibility problem (a screen
  // reader reads German copy with an English voice), though harmless for SEO
  // since the page is noindex either way.

  await en.page.close();
  await de.page.close();
});

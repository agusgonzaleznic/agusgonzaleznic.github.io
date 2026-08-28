// Shared harness for the end-to-end suites.
//
// WHY THESE EXIST AT ALL. src/ holds 126 TypeScript files and had zero tests,
// because the repo deliberately skipped a jsdom/React setup (see the note at
// src/lib/focus-trap.ts). So nothing automated covered the React app: a router
// upgrade, the contact form's client-side validation and the hero's layout all
// had to be checked by hand in a browser. These suites cover exactly that gap,
// by driving the BUILT artifact rather than mounting components.
//
// WHY node:test AND NOT @playwright/test. The four existing suites all run under
// `node --test`, so this adds a dependency (playwright) rather than a second test
// runner, a config file and a second set of conventions.
//
// WHY channel: "chrome". It drives the locally installed Google Chrome, so a
// developer needs no browser download. CI does need one
// (`npx playwright install chromium`), which is why the CI job is a separate,
// deliberate step rather than something these files assume.

import { chromium } from "playwright";

// `window` below appears only inside page.evaluate() callbacks, which are
// serialised and run in the BROWSER, not in node. eslint reads this file as node
// code (eslint.config.js gives **/*.mjs node globals only), so without this it
// reports no-undef and `npm run lint`, which CI runs with --max-warnings 0,
// fails on a file that is correct.
/* global window, document */

/** Where the built site is being served. The runner sets this. */
export const BASE = process.env.E2E_BASE || "http://localhost:4173";

/**
 * Launch a browser for one spec file. `node --test` runs each file in its own
 * process, so a browser per file is the natural unit and needs no sharing.
 */
export async function openBrowser() {
  // Locally this drives the installed Google Chrome, so a developer needs no
  // browser download. CI sets E2E_CHANNEL=bundled to use Playwright's own
  // chromium, which is the build `npx playwright install chromium` provides;
  // passing a channel name there would ask for a browser the runner does not
  // have. Empty or "bundled" both mean "no channel".
  const channel = process.env.E2E_CHANNEL ?? "chrome";
  return chromium.launch(channel && channel !== "bundled" ? { channel } : {});
}

/**
 * Start collecting console errors and uncaught exceptions from a page.
 *
 * React reports a hydration mismatch as a WARNING, not an error, and a
 * mismatch is exactly the class of bug a prerendered site needs to catch, so
 * warnings that look like React diagnostics are collected too.
 *
 * Returns the live array: read it AFTER the interaction, not before.
 */
export function collectErrors(page) {
  const errors = [];
  page.on("console", (m) => {
    const t = m.type();
    if (t === "error") {
      // A failed sub-resource ALSO arrives as a console error, with no URL in the
      // text, so it is impossible to tell ours from a third party's here. The
      // response listener below carries the URL, so this line would only ever
      // duplicate it less usefully.
      if (/Failed to load resource/i.test(m.text())) return;
      errors.push(`console.error: ${m.text()}`);
    } else if (t === "warning" && /hydrat|did not match|^Warning:/i.test(m.text())) {
      errors.push(`console.warn: ${m.text()}`);
    }
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));

  // A sub-resource this site is responsible for must load. Three deliberate
  // exclusions, each for a different reason:
  //
  // 1. CROSS-ORIGIN. The blog's cover images live on Storyblok's CDN, and the
  //    tokenless fixture build points at a deliberately fake asset there, so it
  //    404s. More generally, a merge must not be blocked because somebody else's
  //    CDN is having a bad afternoon. Availability of a third-party asset is a
  //    content question, not a React regression, which is what these suites test.
  // 2. THE DOCUMENT ITSELF. A 404 document is the whole point of not-found.test,
  //    where the real HTTP status is the assertion, so it cannot be an error here.
  // 3. Anything the page deliberately probes. Nothing does today; if that
  //    changes, exclude it explicitly rather than loosening rule 1.
  // A request that never gets a response at all: net::ERR_EMPTY_RESPONSE,
  // ERR_CONNECTION_REFUSED / RESET, a CSP or mixed-content block. Playwright
  // fires requestfailed for these and NOT response, so the listener below cannot
  // see them, and the console line they also produce is the one filtered above.
  // Without this the suite went blind to every transport-level failure, which is
  // exactly how a test passes with the entry chunk never delivered.
  page.on("requestfailed", (req) => {
    if (req.resourceType() === "document") return;
    if (!req.url().startsWith(BASE)) return;
    errors.push(`same-origin request failed (${req.failure()?.errorText ?? "unknown"}): ${req.url()}`);
  });

  page.on("response", (res) => {
    if (res.ok() || res.status() < 400) return;
    const req = res.request();
    if (req.resourceType() === "document") return;
    if (!res.url().startsWith(BASE)) return;
    errors.push(`same-origin ${res.status()} for ${req.resourceType()}: ${res.url()}`);
  });

  return errors;
}

/**
 * Mark the document so a FULL page reload becomes detectable.
 *
 * This is the load-bearing trick in these suites. A client-side navigation
 * preserves the window object; a full reload replaces it. Without this, a router
 * regression that turns every <Link> into a document request still passes every
 * assertion about the destination, because the destination is prerendered and
 * looks identical either way.
 */
export async function markSpa(page) {
  await page.evaluate(() => {
    window.__spaSentinel = "alive";
  });
}

/** True iff no full page reload happened since the last markSpa(). */
export async function stayedSpa(page) {
  return (await page.evaluate(() => window.__spaSentinel)) === "alive";
}

/**
 * True once React has rendered the whole tree under #root.
 *
 * Deliberately not `__reactContainer$` on #root: hydrateRoot() stamps that when
 * the root is CREATED, before hydrating anything, so it only says "started".
 * React attaches `__reactProps$` to each DOM node as it renders that node, so the
 * LAST node inside #root is the last to get one: a whole-tree signal.
 *
 * Verified rather than assumed: running the route sweep with every *.js request
 * aborted times out on this instead of sailing through on un-hydrated server
 * markup, which is what a check on the prerendered DOM alone (an <h1> exists,
 * #root has children) would have done.
 *
 * Lives here rather than in one suite because any test whose premise is "the
 * client ran" needs it. A test that reads server-rendered text and calls that a
 * pass is the failure mode this prevents.
 */
export const HYDRATED = () => {
  const nodes = document.querySelectorAll("#root *");
  const last = nodes[nodes.length - 1];
  return !!last && Object.keys(last).some((k) => k.startsWith("__reactProps$"));
};

/** Wait until the whole tree under #root has hydrated. */
export async function waitForHydration(page, timeout = 15000) {
  await page.waitForFunction(HYDRATED, undefined, { timeout });
}

/** Convenience: a fresh page at a given width, with error collection armed. */
export async function pageAt(browser, width = 1280, height = 900) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = collectErrors(page);
  return { page, errors };
}

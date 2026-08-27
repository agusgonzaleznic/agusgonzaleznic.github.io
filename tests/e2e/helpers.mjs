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
/* global window */

/** Where the built site is being served. The runner sets this. */
export const BASE = process.env.E2E_BASE || "http://localhost:4173";

/**
 * Launch a browser for one spec file. `node --test` runs each file in its own
 * process, so a browser per file is the natural unit and needs no sharing.
 */
export async function openBrowser() {
  return chromium.launch({ channel: process.env.E2E_CHANNEL || "chrome" });
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
    if (t === "error") errors.push(`console.error: ${m.text()}`);
    else if (t === "warning" && /hydrat|did not match|^Warning:/i.test(m.text()))
      errors.push(`console.warn: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
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

/** Convenience: a fresh page at a given width, with error collection armed. */
export async function pageAt(browser, width = 1280, height = 900) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = collectErrors(page);
  return { page, errors };
}

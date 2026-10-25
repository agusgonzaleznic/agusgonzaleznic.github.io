// Keyboard focus and two type fixes from the brand kit's known issues, read from
// the BUILT site's computed styles.
//
// WHY. Only Button, Input, Textarea and the /links profile link drew the coral
// focus ring; the wordmark, the nav links, the footer links and the language
// switcher fell back to the browser's own outline, and nothing compared focus
// against the brand. The fix is one base-layer rule, so the cascade decides the
// rest: a component's own focus-visible utilities must still beat it (Button
// keeps its box-shadow ring), and that half is pinned too.
//
// The type half pins the page h1's line-height (1.5 until now, where the home h1
// had 1.25) and the one eyebrow recipe that the small uppercase labels share
// with the hero: the footer headings were Playfair 700 and the related-pages
// label Inter 700.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { BASE, openBrowser, pageAt, waitForHydration } from "./helpers.mjs";

// The evaluate callbacks run in the BROWSER; eslint.config.js gives **/*.mjs
// node globals only. Same directive as the sibling specs.
/* global getComputedStyle */

let browser;

before(async () => {
  browser = await openBrowser();
});

after(async () => {
  await browser?.close();
});

const CORAL = "rgb(222, 52, 18)";

// One Tab first, so the page is in keyboard modality: Chrome then draws
// :focus-visible for the programmatic focus that follows. `transition-colors`
// covers outline-color, so the ring fades in over 150 ms: read it only after
// the element's transitions finish, or the read lands mid-fade (it did, at
// rgb(115, 40, 27) on the wordmark).
async function focused(path, selectors) {
  const { page } = await pageAt(browser, 1280, 900);
  try {
    await page.goto(BASE + path, { waitUntil: "load" });
    await waitForHydration(page);
    await page.keyboard.press("Tab");
    const out = {};
    for (const selector of selectors) {
      const el = page.locator(selector).first();
      await el.focus();
      await el.evaluate((node) => Promise.all(node.getAnimations().map((a) => a.finished)));
      out[selector] = await el.evaluate((node) => {
        const s = getComputedStyle(node);
        return {
          focusVisible: node.matches(":focus-visible"),
          outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
          offset: s.outlineOffset,
          shadow: s.boxShadow,
        };
      });
    }
    return out;
  } finally {
    await page.close();
  }
}

test("keyboard focus draws the coral ring on the wordmark, nav, footer and language switcher", async () => {
  const targets = [
    'nav a[href="/"]', // the wordmark (a button on the home page, a link elsewhere)
    'nav a[href="/services"]',
    'button[aria-label="Change language"]',
    'footer a[href="/faq"]',
    'footer nav[aria-label="Language"] a',
  ];
  const got = await focused("/about", targets);
  for (const selector of targets) {
    const f = got[selector];
    assert.ok(f.focusVisible, `${selector} was focused without :focus-visible, so this read nothing`);
    assert.equal(f.outline, `solid 2px ${CORAL}`, `${selector} outline`);
    assert.equal(f.offset, "2px", `${selector} outline offset`);
  }
});

test("a component's own focus ring still beats the base rule (the booking button)", async () => {
  const selector = 'nav a[href^="https://"]';
  const f = (await focused("/about", [selector]))[selector];
  assert.ok(f.focusVisible, "the booking button was focused without :focus-visible");
  assert.ok(f.shadow.includes(CORAL), `the button's ring is its box-shadow, got ${f.shadow}`);
  // outline-hidden sets only the style, so the base rule's colour still computes
  // on the button; with no style, nothing is drawn.
  assert.ok(f.outline.startsWith("none "), `the base outline leaked onto the button: ${f.outline}`);
});

test("page h1s set 1.25 like the home h1, and the small labels share the hero's eyebrow recipe", async () => {
  const { page } = await pageAt(browser, 1280, 900);
  try {
    const read = async (path, selectors) => {
      await page.goto(BASE + path, { waitUntil: "load" });
      await waitForHydration(page);
      const out = {};
      for (const selector of selectors) {
        await page.waitForSelector(selector, { timeout: 15000 });
        out[selector] = await page.locator(selector).first().evaluate((node) => {
          const s = getComputedStyle(node);
          return {
            ratio: parseFloat(s.lineHeight) / parseFloat(s.fontSize),
            recipe: [s.fontFamily.split(",")[0], s.fontWeight, s.fontSize, s.textTransform, s.letterSpacing].join(" "),
          };
        });
      }
      return out;
    };
    const home = await read("/", ["h1", "p.uppercase:has(> span.bg-accent)"]);
    const about = await read("/about", ["h1", 'nav[aria-label="Keep exploring"] p', "footer h4"]);
    assert.equal(home.h1.ratio, 1.25, "home h1");
    assert.equal(about.h1.ratio, 1.25, "about h1");
    const hero = home["p.uppercase:has(> span.bg-accent)"].recipe;
    assert.match(hero, /^Inter 500 14px uppercase /, `the hero eyebrow itself: ${hero}`);
    assert.equal(about['nav[aria-label="Keep exploring"] p'].recipe, hero, "related-pages label");
    assert.equal(about["footer h4"].recipe, hero, "footer heading");
  } finally {
    await page.close();
  }
});

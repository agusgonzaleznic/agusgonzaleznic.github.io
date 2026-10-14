// End-to-end guard for the stylesheet's cascade contract under Tailwind 4.
//
// Tailwind 4 emits all of its CSS in native cascade layers, and a rule outside
// any layer beats every layered rule, whatever its specificity or source order.
// The hand-written pre-paint shell in index.html used to sit outside a layer:
// its stale `--accent` (58%, 3.44:1) undid the WCAG contrast fix on every coral
// CTA, and its `*{border-color}` overrode every border utility, including the
// darker `border-input` that gives form fields their 3:1 edge. Nothing else in
// this suite reads computed styles, so nothing caught it.
//
// Three more v4 behaviours are pinned here because they changed silently during
// the upgrade: Preflight dropped `cursor: pointer` on buttons; converting the
// site's own utilities to `@utility` re-sorted them, which let `transition-all`
// and the stagger delays override `.hover-lift` on the service cards; and
// sonner's runtime stylesheet, unlayered, outranks the toast utilities. The
// last test covers an older bug: the entrance-animated cards never lifted.
//
// Every assertion reads the BUILT site's computed values, so it holds whatever
// the source looks like.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { BASE, openBrowser, pageAt, waitForHydration } from "./helpers.mjs";

// The evaluate callbacks run in the BROWSER; eslint.config.js gives **/*.mjs
// node globals only. Same directive as the sibling specs.
/* global document, getComputedStyle */

let browser;

before(async () => {
  browser = await openBrowser();
});

after(async () => {
  await browser?.close();
});

// Waits for `selector` itself, not just hydration: some sections (the contact
// form) mount after the hydration signal, and reading too early finds nothing.
async function computed(path, selector, fn) {
  const { page } = await pageAt(browser, 1280, 900);
  try {
    await page.goto(BASE + path, { waitUntil: "load" });
    await waitForHydration(page);
    await page.waitForSelector(selector, { timeout: 15000 });
    return await page.evaluate(fn, selector);
  } finally {
    await page.close();
  }
}

test("the stylesheet's --accent wins over the pre-paint shell (WCAG CTA contrast)", async () => {
  const got = await computed("/contact", "nav a[class*='bg-accent']", (sel) => ({
    accent: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(),
    cta: getComputedStyle(document.querySelector(sel)).backgroundColor,
  }));
  assert.equal(got.accent, "10 85% 47%");
  assert.equal(got.cta, "rgb(222, 52, 18)", "the nav CTA must use the 47% accent (4.57:1 with white text)");
});

test("border utilities beat the shell's *{border-color} (form fields keep their 3:1 edge)", async () => {
  const got = await computed("/contact", "input[class*='border-input']", (sel) =>
    getComputedStyle(document.querySelector(sel)).borderTopColor,
  );
  // hsl(220 10% 59%): the darker --input token, not the decorative --border.
  assert.equal(got, "rgb(140, 147, 161)");
});

test("enabled buttons keep the pointer cursor Preflight no longer sets", async () => {
  // The language switcher: an always-enabled type="button" in the nav. (The
  // contact submit button starts disabled until the spam check passes.)
  const got = await computed("/contact", "nav button[type='button']:not(:disabled)", (sel) =>
    getComputedStyle(document.querySelector(sel)).cursor,
  );
  assert.equal(got, "pointer");
});

test("contact toasts keep the site's surface over sonner's runtime stylesheet", async () => {
  // sonner injects an unlayered stylesheet that outranks every layered utility;
  // src/index.css answers it with an unlayered, more specific rule. Raise a real
  // toast: the submit button stays disabled without a Turnstile token, so submit
  // the form directly with native validation off and let the client-side
  // validation raise its error toast.
  const { page } = await pageAt(browser, 1280, 900);
  try {
    await page.goto(BASE + "/contact", { waitUntil: "load" });
    await waitForHydration(page);
    await page.waitForSelector("form", { timeout: 15000 });
    await page.evaluate(() => {
      const form = document.querySelector("form");
      form.noValidate = true;
      form.requestSubmit();
    });
    await page.waitForSelector("[data-sonner-toast]", { timeout: 15000 });
    const got = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector("[data-sonner-toast]"));
      return { background: cs.backgroundColor, border: cs.borderTopColor, shadow: cs.boxShadow };
    });
    assert.equal(got.background, "rgb(250, 250, 250)", "toast background must be --background, not sonner's white");
    assert.equal(got.border, "rgb(221, 223, 227)", "toast border must be --border");
    assert.match(got.shadow, /0px 16px 48px -12px/, "toast shadow must be the site's shadow-lg");
  } finally {
    await page.close();
  }
});

test(".hover-lift keeps its own transition over transition-all and the stagger delays", async () => {
  const got = await computed("/services", ".hover-lift", (sel) =>
    [...document.querySelectorAll(sel)].map((el) => {
      const cs = getComputedStyle(el);
      return { property: cs.transitionProperty, delay: cs.transitionDelay };
    }),
  );
  assert.ok(got.length > 0, "no .hover-lift element on /services");
  for (const { property, delay } of got) {
    assert.equal(property, "translate, box-shadow");
    assert.equal(delay, "0s, 0s");
  }
});

test("entrance-animated cards lift on hover like the rest", async () => {
  // The entrance animation fills both ways, so after it lands the card keeps
  // the last keyframe's transform, and an animation's value beats a declared
  // one: a transform lift never moved these cards. The lift uses translate.
  const { page } = await pageAt(browser, 1280, 900);
  try {
    await page.goto(BASE + "/services", { waitUntil: "load" });
    await waitForHydration(page);
    const card = page.locator(".hover-lift.animate-fade-in-up").first();
    await card.scrollIntoViewIfNeeded();
    // Test the landed card, not one mid-animation.
    await card.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    await page.mouse.move(0, 0);
    const before = await card.evaluate((el) => el.getBoundingClientRect().top);
    await card.hover();
    const handle = await card.elementHandle();
    const lifted = await page
      .waitForFunction(([el, top]) => Math.abs(top - el.getBoundingClientRect().top - 4) < 0.5, [handle, before], { timeout: 3000 })
      .then(() => true, () => false);
    const after = await card.evaluate((el) => el.getBoundingClientRect().top);
    assert.ok(lifted, `the card moved ${before - after}px on hover, expected 4px up`);
  } finally {
    await page.close();
  }
});

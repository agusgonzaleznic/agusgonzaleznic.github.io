// End-to-end spec for the mobile navigation overlay: dialog semantics, focus
// entry, the Tab trap, Escape, and focus restoration.
//
// WHY THIS FILE EXISTS. src/lib/focus-trap.ts says outright that its behaviour
// cannot be unit-tested in this repo (no jsdom/React setup) and is "verified
// structurally and by hand in a browser". Structural checks cannot see a wrap,
// hand checks do not survive a refactor, and the bug the hook fixed is invisible
// in a screenshot: with the overlay open, Tab used to walk out of the menu into
// the page underneath, where the focus ring hides behind an opaque backdrop.
// Driving the BUILT site is the only way to exercise the hook here.
//
// HOW THESE ASSERTIONS ARE KEPT HONEST. A focus assertion passes for boring
// reasons: focus was already there, or the element merely happened to be next in
// DOM order. So each claim is paired with a measured counterfactual rather than
// an argument, and the whole file was checked by MUTATING THE SERVED BUNDLE, one
// behaviour at a time (playwright request interception, no repo edit): the
// offsetParent filter, the focus-in, each wrap direction, the pull-back branch,
// the Escape branch, the restore, and the dialog attributes were each removed in
// turn. Every mutation was caught by the test named for it. The one that was NOT,
// until this file changed, is written up in the pull-back test: worth reading
// before trusting any focus assertion in here on its shape alone.
//
// document/window/requestAnimationFrame appear only inside page.evaluate
// callbacks, which run in the browser. The **/*.mjs lint block supplies Node
// globals only, so they are declared here (helpers.mjs has the same gap).
/* global document, window, requestAnimationFrame */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { BASE, openBrowser, pageAt, markSpa, stayedSpa } from "./helpers.mjs";

// 375 is below Tailwind's md (768), so the toggle and the `md:hidden` overlay are
// the reachable navigation. At >=768 the panel is display:none and none of this
// is exercisable.
const WIDTH = 375;
const HEIGHT = 720;

const TOGGLE = 'button[aria-controls="mobile-menu"]';
const PANEL = "#mobile-menu";

// The panel's tab order, by href: hrefs are stable across locales, labels are
// not. Pinning the WHOLE order rather than just the endpoints is what makes a
// leak legible, since the diff then names the element focus escaped to.
const PANEL_TAB_ORDER = [
  "/about",
  "/philosophy",
  "/services",
  "/impact",
  "/faq",
  "/blog/",
  "/contact",
  "https://calendar.app.google/kFaanhSae5WefLnD7", // Book a Session
];
const FIRST = PANEL_TAB_ORDER[0];
const LAST = PANEL_TAB_ORDER[PANEL_TAB_ORDER.length - 1];

let browser;
before(async () => {
  browser = await openBrowser();
});
after(async () => {
  await browser?.close();
});

/**
 * Wait until React has hydrated the toggle itself.
 *
 * The site is prerendered, so the toggle exists in the static HTML with no
 * handler: a click landing before hydration is silently a no-op that surfaces
 * later as a confusing timeout. React 18 stamps `__reactProps$<random>` on a host
 * node as it hydrates that fiber, which is a signal about the exact element under
 * test rather than a whole-document proxy like networkidle. Measured: the key
 * lands ~40ms after DOMContentLoaded, and the first click then always opens.
 */
function hydrated(page) {
  return page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps$"));
    },
    TOGGLE,
    { timeout: 15000 },
  );
}

/**
 * Let React flush passive effects. Both halves of the hook live in a useEffect
 * (focus-in on open, restore in the cleanup), and React commits the DOM before
 * flushing them, so reading activeElement in the same tick as a mount or unmount
 * reads it mid-transition. Keystrokes need no settle: the hook focuses
 * synchronously inside its keydown handler, which has run when press() resolves.
 */
function settle(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0)));
      }),
  );
}

/**
 * A fresh mobile page with the menu open and focus settled.
 *
 * Defaults to "/" and every test here keeps that default, deliberately. Measured
 * on this build: a direct load of any lazily-routed page (/about, /philosophy,
 * /services, /impact, /faq, /contact, /links) logs React #418 hydration
 * mismatches plus #422 before any interaction, at 375 and at 1280. Only "/" (the
 * eager Index route) and "/blog/" come up clean. That is a real defect and NOT
 * this file's subject, so the nav is specified where the page is quiet; pointing
 * these tests at another route would drown the console assertions in it.
 */
async function openMenu(path = "/") {
  const { page, errors } = await pageAt(browser, WIDTH, HEIGHT);
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await hydrated(page);
  await page.click(TOGGLE);
  await page.waitForSelector(PANEL);
  await settle(page);
  return { page, errors };
}

/** Where focus actually is, identified well enough to blame something. */
function at(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    const panel = document.getElementById("mobile-menu");
    const nav = document.querySelector("nav");
    return {
      href: el?.getAttribute ? el.getAttribute("href") : null,
      probe: el?.getAttribute ? el.getAttribute("data-e2e") : null,
      isToggle: el?.getAttribute ? el.getAttribute("aria-controls") === "mobile-menu" : false,
      inPanel: !!(panel && el && panel.contains(el)),
      inNav: !!(nav && el && nav.contains(el)),
      isBody: el === document.body,
    };
  });
}

/** Put focus on a panel link by href, without going through the keyboard. */
function focusPanelLink(page, href) {
  return page.evaluate((h) => {
    const link = Array.from(document.querySelectorAll("#mobile-menu a[href]")).find(
      (a) => a.getAttribute("href") === h,
    );
    if (!link) throw new Error(`no panel link with href ${h}`);
    link.focus();
  }, href);
}

/**
 * Disable the trap for one page, so the counterfactual can be measured.
 *
 * focus-trap.ts registers its handler on `document` in the BUBBLE phase, so a
 * capture-phase listener on the same node runs first and stops the event before
 * the hook sees it. stopPropagation blocks the listener, not the default action,
 * so the browser still performs its own Tab move: the "no trap" world. If the
 * hook ever moves to capture this stops suppressing and the control test fails,
 * which is the right alarm -- a control that silently stopped controlling would
 * make every wrap assertion vacuous again.
 */
function withoutTrap(page) {
  return page.evaluate(() => {
    document.addEventListener("keydown", (e) => e.stopPropagation(), true);
  });
}

// --- opening -----------------------------------------------------------------

test("the open panel is exposed as a modal dialog, outside the nav bar", async () => {
  const { page, errors } = await pageAt(browser, WIDTH, HEIGHT);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await hydrated(page);

  // Read before AND after: a toggle hardcoded to aria-expanded="true" would
  // satisfy the post-open half on its own.
  const closed = await page.getAttribute(TOGGLE, "aria-expanded");
  assert.equal(closed, "false", "the closed toggle must not claim to be expanded");
  assert.equal(await page.locator(PANEL).count(), 0, "no panel before opening");

  await page.click(TOGGLE);
  await page.waitForSelector(PANEL);
  await settle(page);
  assert.equal(await page.getAttribute(TOGGLE, "aria-expanded"), "true");

  const shape = await page.evaluate(() => {
    const panel = document.getElementById("mobile-menu");
    const nav = document.querySelector("nav");
    const toggle = document.querySelector('button[aria-controls="mobile-menu"]');
    return {
      role: panel.getAttribute("role"),
      modal: panel.getAttribute("aria-modal"),
      label: panel.getAttribute("aria-label"),
      controls: toggle.getAttribute("aria-controls"),
      id: panel.id,
      // The structural fact the hook exists to compensate for: a plain fixed div
      // NEXT TO the nav, not a dialog element, constraining nothing by itself.
      insideNav: nav.contains(panel),
      sharesParentWithNav: panel.parentElement === nav.parentElement,
    };
  });

  assert.equal(shape.role, "dialog", "no role means it is announced as a plain group");
  assert.equal(shape.modal, "true", "aria-modal is what marks the page behind inert");
  assert.ok(shape.label?.length > 0, "an unnamed dialog is announced as just 'dialog'");
  assert.equal(shape.controls, shape.id, "aria-controls must resolve to the panel");
  assert.equal(shape.insideNav, false);
  assert.equal(shape.sharesParentWithNav, true);
  assert.deepEqual(errors, []);
  await page.close();
});

test("opening moves focus INTO the panel", async () => {
  const { page, errors } = await pageAt(browser, WIDTH, HEIGHT);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await hydrated(page);

  // Record the focus history rather than sampling it. "Focus is on the first
  // panel link" only means something because focus was demonstrably on the toggle
  // first, and sampling that intermediate state is a race: the passive effect
  // flushes in less time than one round trip to the browser (measured, by an
  // earlier revision of this test that always read the post-effect state).
  await page.evaluate(() => {
    window.__focusLog = [];
    document.addEventListener("focusin", (e) => {
      const el = e.target;
      window.__focusLog.push(
        el.getAttribute?.("aria-controls") === "mobile-menu"
          ? "TOGGLE"
          : el.getAttribute?.("href") || el.tagName,
      );
    });
  });

  await page.click(TOGGLE);
  await page.waitForSelector(PANEL);
  await settle(page);

  assert.deepEqual(
    await page.evaluate(() => window.__focusLog),
    ["TOGGLE", FIRST],
    "the click focuses the toggle, then the trap must move focus into the panel",
  );
  const opened = await at(page);
  assert.equal(opened.inPanel, true, "focus must land inside the overlay, not behind it");
  assert.equal(opened.href, FIRST, "focus goes to the panel's first focusable");
  assert.deepEqual(errors, []);
  await page.close();
});

// --- the Tab trap ------------------------------------------------------------

test("Tab wraps from the last panel item to the first, and Shift+Tab back", async () => {
  const { page, errors } = await openMenu();

  // Walk the whole panel with real key presses, so a leak in the middle is
  // reported as the element focus reached rather than as a bare false.
  const walked = [FIRST];
  for (let i = 1; i < PANEL_TAB_ORDER.length; i++) {
    await page.keyboard.press("Tab");
    walked.push((await at(page)).href);
  }
  assert.deepEqual(walked, PANEL_TAB_ORDER, "Tab must visit only the panel's own items");

  // The assertion the original bug fails. Measured with the hook suppressed, this
  // same press lands on the /services link in the page behind the overlay.
  await page.keyboard.press("Tab");
  const wrapped = await at(page);
  assert.equal(wrapped.href, FIRST, "Tab past the last item must wrap to the first");
  assert.equal(wrapped.inPanel, true);

  // Backwards from the first. Measured with the hook suppressed: the toggle.
  await page.keyboard.press("Shift+Tab");
  const back = await at(page);
  assert.equal(back.href, LAST, "Shift+Tab before the first item must wrap to the last");
  assert.equal(back.inPanel, true);

  assert.deepEqual(errors, []);
  await page.close();
});

test("with the trap suppressed the SAME keystrokes walk out of the panel", async () => {
  // The control that makes the test above non-vacuous: it asserts the BUG, so it
  // fails if suppression stops working instead of leaving the wrap assertions
  // passing for free.
  {
    const { page } = await openMenu();
    await withoutTrap(page);
    await focusPanelLink(page, LAST);
    await page.keyboard.press("Tab");
    const out = await at(page);
    assert.equal(out.inPanel, false, "trapped this wraps; suppressed it must escape");
    assert.equal(out.inNav, false, "into the page content hidden behind the backdrop");
    await page.close();
  }
  {
    const { page } = await openMenu();
    await withoutTrap(page);
    await focusPanelLink(page, FIRST);
    await page.keyboard.press("Shift+Tab");
    const out = await at(page);
    assert.equal(out.inPanel, false);
    assert.equal(out.isToggle, true, "backwards the escape hatch is the toggle");
    await page.close();
  }
});

test("Tab pulls focus back in when it has escaped the panel", async () => {
  // focus-trap.ts pulls focus back to the first item when it finds focus outside
  // the container (a backdrop click, an AT-driven move).
  //
  // The parking spot is load-bearing and the obvious one is useless: parked on
  // the TOGGLE this test passes with the pull-back branch DELETED, because the
  // panel is the toggle's next sibling and the browser's own Tab reaches the
  // panel's first link anyway (measured -- deleting that branch from the served
  // bundle left the toggle version green). From the brand button the two
  // behaviours diverge, so the assertion has to choose.
  const brand = (p) =>
    p.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("nav button")).find(
        (b) => b.textContent.trim() === "AGN",
      );
      if (!btn) throw new Error("brand control not found");
      btn.focus();
    });

  const { page, errors } = await openMenu();
  await brand(page);
  const parked = await at(page);
  assert.equal(parked.inPanel, false, "parked outside the panel on purpose");
  assert.equal(parked.inNav, true);

  await page.keyboard.press("Tab");
  const pulled = await at(page);
  assert.equal(pulled.inPanel, true, "Tab from outside must re-enter the overlay");
  assert.equal(pulled.href, FIRST);
  assert.deepEqual(errors, []);
  await page.close();

  // Counterfactual: same element, same key, no menu open. The browser's own
  // answer is the toggle, which is what the assertion above must reject.
  const { page: shut } = await pageAt(browser, WIDTH, HEIGHT);
  await shut.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await hydrated(shut);
  await brand(shut);
  await shut.keyboard.press("Tab");
  const unaided = await at(shut);
  assert.equal(unaided.isToggle, true, "unaided, Tab from the brand reaches only the toggle");
  await shut.close();
});

// --- closing -----------------------------------------------------------------

test("Escape closes the menu; other keys leave it open", async () => {
  const { page, errors } = await openMenu();

  // Negative control first, so the close cannot be credited to keyboard activity
  // in general. Deliberately not Enter or Space: focus is on a link, and
  // activating it would close the menu for the wrong reason.
  for (const key of ["ArrowDown", "e", "Home", "End"]) {
    await page.keyboard.press(key);
    assert.equal(await page.locator(PANEL).count(), 1, `${key} must not close the menu`);
  }
  assert.equal(await page.getAttribute(TOGGLE, "aria-expanded"), "true");

  await page.keyboard.press("Escape");
  await page.waitForSelector(PANEL, { state: "detached" });
  await settle(page);
  assert.equal(await page.locator(PANEL).count(), 0);
  const expanded = await page.getAttribute(TOGGLE, "aria-expanded");
  assert.equal(expanded, "false", "the toggle must stop claiming to be expanded");
  assert.deepEqual(errors, []);
  await page.close();
});

test("closing in place hands focus back to the toggle", async () => {
  const { page, errors } = await pageAt(browser, WIDTH, HEIGHT);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await hydrated(page);

  // What "no restoration" looks like, measured here rather than assumed: removing
  // the focused element drops focus to <body>. That is the state the final
  // assertion excludes, which is why it is not vacuous. Taken BEFORE opening
  // because it moves focus: an earlier revision ran it after, left focus on
  // <body>, and shifted the Tab walk below by one. The trap noticed and the test
  // failed, which is the point.
  const baseline = await page.evaluate(() => {
    const probe = document.createElement("button");
    document.body.appendChild(probe);
    probe.focus();
    const took = document.activeElement === probe;
    probe.remove();
    return { took, landedOnBody: document.activeElement === document.body };
  });
  assert.deepEqual(baseline, { took: true, landedOnBody: true });

  await page.click(TOGGLE);
  await page.waitForSelector(PANEL);
  await settle(page);
  assert.equal((await at(page)).href, FIRST);

  // Move focus off the toggle: restoring to it is only a real move if focus was
  // demonstrably elsewhere when the menu closed.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const before = await at(page);
  assert.equal(before.href, PANEL_TAB_ORDER[2]);
  assert.equal(before.isToggle, false);

  await page.keyboard.press("Escape");
  await page.waitForSelector(PANEL, { state: "detached" });
  await settle(page);

  const restored = await at(page);
  assert.equal(restored.isToggle, true, "focus returns to the control that opened the menu");
  assert.equal(restored.isBody, false, "on <body> the next Tab restarts from the top");
  assert.deepEqual(errors, []);
  await page.close();

  // The other in-place close path. The backdrop is the panel's first child
  // (absolute inset-0), the only element in the overlay whose sole job is closing
  // it, and it must hand focus back the same way Escape does.
  const { page: p2, errors: e2 } = await openMenu();
  await p2.keyboard.press("Tab");
  assert.equal((await at(p2)).inPanel, true);
  await p2.evaluate(() => document.querySelector("#mobile-menu > div").click());
  await p2.waitForSelector(PANEL, { state: "detached" });
  await settle(p2);
  assert.equal((await at(p2)).isToggle, true, "a backdrop close must restore focus too");
  assert.deepEqual(e2, []);
  await p2.close();
});

test("following a nav link replaces the nav, so focus is NOT restored", async () => {
  // The boundary case the hook's `document.contains(previouslyFocused)` guard
  // exists for. <Navigation> renders inside each page component and every route
  // except Index is a lazy chunk under <Suspense fallback={null}> (src/App.tsx),
  // so following a link unmounts the whole nav while that chunk loads: the element
  // captured on open is already detached when the cleanup runs.
  //
  // HONEST LIMIT: this pins the outcome and its cause, not the guard. Measured,
  // focusing a detached element in Chrome neither throws nor moves focus, so
  // deleting the guard produces the same <body> focus. Nothing here can tell the
  // two apart, and an assertion implying otherwise would be theatre.
  const { page, errors } = await openMenu();
  await page.evaluate((sel) => {
    window.__toggleAtOpen = document.querySelector(sel);
  }, TOGGLE);
  await markSpa(page);

  await page.click(`${PANEL} a[href="/faq"]`);
  await page.waitForSelector(PANEL, { state: "detached" });
  await settle(page);

  assert.equal(await stayedSpa(page), true, "a nav link navigates client-side, not by reload");
  assert.match(new URL(page.url()).pathname, /^\/faq\/?$/);

  const outcome = await page.evaluate(
    (sel) => ({
      capturedStillAttached: document.contains(window.__toggleAtOpen),
      capturedIsCurrentToggle: window.__toggleAtOpen === document.querySelector(sel),
      activeIsBody: document.activeElement === document.body,
    }),
    TOGGLE,
  );
  assert.equal(
    outcome.capturedStillAttached,
    false,
    "if the nav now SURVIVES a route change, assert restoration here instead",
  );
  assert.equal(outcome.capturedIsCurrentToggle, false, "the new nav is a new element");
  assert.equal(outcome.activeIsBody, true);
  assert.deepEqual(errors, []);
  await page.close();
});

// --- the offsetParent filter -------------------------------------------------

test("collapsed switcher anchors are never trap boundaries", async () => {
  // focus-trap.ts filters on offsetParent because the dropdown switcher keeps its
  // anchors in the DOM (crawlable) and hides them only visually. Today those
  // anchors sit in the DESKTOP cluster inside <nav>, display:none at 375px, and
  // the panel has no switcher of its own -- so the filter has no subject inside
  // the container it guards. Part 1 pins the facts that make that true; part 2
  // has to construct the case, because part 1 says there is nothing real to use.
  const { page, errors } = await openMenu();
  const facts = await page.evaluate(() => {
    const panel = document.getElementById("mobile-menu");
    // Scoped to the TOP BAR deliberately: the footer renders the same component
    // in its `inline` variant, whose anchors are permanently visible, so an
    // unscoped `nav a[hreflang]` sweeps those in and "all collapsed" is false for
    // reasons unrelated to the trap (measured: an earlier revision failed exactly
    // this way). The top bar is the first <nav> in document order.
    const topNav = document.querySelector("nav");
    const anchors = Array.from(topNav.querySelectorAll("a[hreflang]"));
    const anywhere = Array.from(document.querySelectorAll("a[hreflang]"));
    const FOCUSABLE = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");
    const inPanel = Array.from(panel.querySelectorAll(FOCUSABLE));
    return {
      switcherCount: anchors.length,
      allCollapsed: anchors.every((a) => a.offsetParent === null),
      anyInPanel: anywhere.some((a) => panel.contains(a)),
      panelFocusables: inPanel.length,
      panelHidden: inPanel.filter((n) => n.offsetParent === null).length,
    };
  });

  assert.ok(facts.switcherCount > 0, "no switcher anchors at all would prove nothing");
  assert.equal(facts.allCollapsed, true, "the top-bar switcher anchors are display:none here");
  assert.equal(facts.anyInPanel, false, "no switcher anchor is inside the trapped container");
  assert.equal(facts.panelFocusables, PANEL_TAB_ORDER.length);
  assert.equal(facts.panelHidden, 0, "every current trap boundary is visible");
  assert.deepEqual(errors, []);
  await page.close();

  // Part 2 is SYNTHETIC and has to be: with nothing display:none in the panel,
  // the only way to exercise the filter is to inject the shape focus-trap.ts
  // describes, a <nav> of real anchors hidden only by display. Injected as the
  // panel's LAST child, so an unfiltered list ends on a hidden anchor. The arms
  // differ in exactly ONE property, `display`, which is what offsetParent reads.
  // Arm 1 is the regression detector, verified by removing the filter from the
  // served bundle: `last` becomes the hidden anchor, the wrap never fires, and
  // arm 1 fails while every other test stays green. Arm 2 shows arm 1 is
  // sensitive to that boundary, not to something incidental about the markup.
  const inject = (page, display) =>
    page.evaluate((d) => {
      const nav = document.createElement("nav");
      nav.setAttribute("aria-label", "Language");
      nav.style.display = d;
      for (const locale of ["de", "es"]) {
        const a = document.createElement("a");
        a.href = `/${locale}/`;
        a.setAttribute("hreflang", locale);
        a.setAttribute("data-e2e", `switcher-${locale}`);
        a.textContent = locale.toUpperCase();
        nav.appendChild(a);
      }
      document.getElementById("mobile-menu").appendChild(nav);
    }, display);

  const boundaries = (page) =>
    page.evaluate(() => {
      const all = Array.from(document.querySelectorAll("#mobile-menu a[href]"));
      const visible = all.filter((n) => n.offsetParent !== null);
      return {
        total: all.length,
        lastOfAll: all[all.length - 1].getAttribute("href"),
        lastVisible: visible[visible.length - 1].getAttribute("href"),
      };
    });

  // Arm 1: collapsed. The hidden anchors must not become the wrap point.
  {
    const { page, errors } = await openMenu();
    await inject(page, "none");
    const b = await boundaries(page);
    assert.equal(b.total, PANEL_TAB_ORDER.length + 2, "the injected anchors are in the DOM");
    assert.equal(b.lastOfAll, "/es/", "and really last in document order");
    assert.equal(b.lastVisible, LAST, "but not the last VISIBLE focusable");

    await focusPanelLink(page, LAST);
    await page.keyboard.press("Tab");
    const wrapped = await at(page);
    assert.equal(wrapped.href, FIRST, "a collapsed anchor must not steal the trap boundary");
    assert.equal(wrapped.probe, null, "and must never receive focus");
    assert.deepEqual(errors, []);
    await page.close();
  }

  // Arm 2: same markup, revealed. Now it legitimately IS the last boundary, so
  // the wrap must NOT fire. Same code, opposite outcome, one property apart.
  {
    const { page, errors } = await openMenu();
    await inject(page, "block");
    assert.equal((await boundaries(page)).lastVisible, "/es/");

    await focusPanelLink(page, LAST);
    await page.keyboard.press("Tab");
    const moved = await at(page);
    assert.notEqual(moved.href, FIRST, "a VISIBLE trailing anchor must not be skipped");
    assert.equal(moved.probe, "switcher-de", "Tab continues into it instead of wrapping");
    assert.deepEqual(errors, []);
    await page.close();
  }
});

// --- noise -------------------------------------------------------------------

test("the whole interaction runs clean, and the error guard is armed", async () => {
  const { page, errors } = await openMenu();
  for (let i = 0; i < PANEL_TAB_ORDER.length + 1; i++) await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Escape");
  await page.waitForSelector(PANEL, { state: "detached" });
  await settle(page);
  await page.click(TOGGLE);
  await page.waitForSelector(PANEL);
  await settle(page);
  await page.evaluate(() => document.querySelector("#mobile-menu > div").click());
  await page.waitForSelector(PANEL, { state: "detached" });
  await settle(page);
  assert.deepEqual(errors, [], "open/trap/escape/reopen/backdrop must log nothing");

  // An empty array is also what a DEAF collector returns, so prove this one hears
  // both channels before trusting the assertion above. Last, on the same page, so
  // nothing else depends on the deliberate noise. Console messages arrive over CDP
  // asynchronously, hence the bounded wait rather than a single read.
  await page.evaluate(() => {
    console.error("e2e-armed");
    console.warn("Warning: e2e-armed-hydration");
  });
  for (let i = 0; i < 40 && errors.length < 2; i++) await settle(page);
  assert.deepEqual(errors, [
    "console.error: e2e-armed",
    "console.warn: Warning: e2e-armed-hydration",
  ]);
  await page.close();
});

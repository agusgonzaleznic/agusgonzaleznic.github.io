// End-to-end spec for the contact form's CLIENT-SIDE validation (Contact.tsx).
//
// WHY THIS FILE EXISTS. Contact.tsx carries more logic than anything else in
// src/ (ten validation branches, a Turnstile lifecycle, a signed POST) and had
// zero automated coverage, so every rule in it was a hand-check in a browser.
// Two recent changes are why it can no longer be left that way: the email rule
// went from "something @ something . something" to an allowlist-after-parse,
// which REJECTS addresses the old one accepted; and a domain typo became a soft
// gate, warning once and then letting the same value through. Half a soft gate
// is worse than none, because a check that warns and then keeps refusing strands
// a visitor whose address works.
//
// WHAT THIS FILE DELIBERATELY DOES NOT COVER. The form cannot submit here. The
// send button is `disabled={isSubmitting || !turnstileToken}`, this preview build
// has no VITE_TURNSTILE_SITE_KEY (measured: the widget slot renders the
// "Verification isn't available right now" alert, and `challenges.cloudflare.com`
// appears nowhere in dist/ because the sitekey guard let the loader be
// tree-shaken out), and /api/contact does not exist on localhost. So the
// byte-size cap inside the try block, the response status switch and the timeout
// branch are unreachable from here and are NOT asserted: they need the Lambda's
// own tests plus a staging origin.
//
// HOW SUBMISSION IS DRIVEN, and why not a click. Two gates sit in front of
// React's onSubmit and both would make a click test lie. The send button is
// disabled (above), so a click never fires submit at all; and
// `form.requestSubmit()` runs NATIVE constraint validation first, which swallows
// the very cases under test -- measured here with checkValidity(), Chrome refuses
// `x@y..z` and `a@-b.co` on its own but considers `a@b.c`, `.a@b.co` and
// `a.@b.co` perfectly valid, so the native gate would "pass" three tightened
// cases without ever running EMAIL_RE. So the suite dispatches a bubbling
// `submit` event on the <form>, the only way to reach the React validator in
// isolation, and pins the layering the native gate does provide in its own test.
//
// EVERY ASSERTION HERE WAS PROVED TO DISCRIMINATE against a deliberately broken
// build: a copy of this file intercepts the Contact chunk and string-patches the
// minified source before the page loads it, so the regression is real rather than
// argued. Twenty mutations, all caught, among them the email rule reverted to the
// old pattern, the email rule over-tightened to reject `+` and uppercase (the
// direction refusal cases alone would miss), focus no longer moving to the
// offending field, and the typo acknowledgement forgotten so the soft gate blocks
// on EVERY submit -- caught by the two "warns then ACCEPTED" tests and by nothing
// else, which is the whole reason those submit twice.

/* global document, HTMLInputElement, HTMLTextAreaElement */
// The eslint config gives **/*.mjs node globals only, and every browser
// identifier below runs inside a page.evaluate() callback, in Chrome. Declaring
// them keeps `npm run lint --max-warnings 0` honest without loosening the config.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { BASE, openBrowser, pageAt } from "./helpers.mjs";

// HAND-SYNCED with the constants at the top of src/components/Contact.tsx (which
// are themselves hand-synced with the Lambda schema). Keeping a second copy here
// is the point: the bounds reach the screen because the component interpolates
// them, so if NAME_MAX moves without a deliberate paired edit, the "one over the
// bound" cases below stop failing and this suite says so.
const NAME_MAX = 100;
const EMAIL_MAX = 200;
const ROLE_MAX = 100;
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 4000;
const EMAIL_LOCAL_MAX = 64;

const FIELDS = ["name", "email", "role", "message"];

// Built, not written as escapes, so this file stays free of invisible bytes: a
// literal control character in a fixture is unreviewable in a diff and gets
// silently eaten by editors and copy-paste.
const SOH = String.fromCharCode(0x01); // C0, forbidden everywhere
const BEL = String.fromCharCode(0x07); // C0, forbidden even in the message
const DEL = String.fromCharCode(0x7f); // not C0, forbidden by the same rule

// A message SHORTER than MESSAGE_MIN, the tail sentinel almost everywhere. The
// message minimum is the LAST field rule, so "the error landed on #message" is
// positive proof that every earlier rule (the email rule above all) let the value
// through. Asserting merely "no email error" would also hold for a dead handler.
const TOO_SHORT = "short";
const LONG_ENOUGH = "a".repeat(MESSAGE_MIN);

let browser;

before(async () => {
  browser = await openBrowser();
});

after(async () => {
  await browser?.close();
});

/**
 * A fresh /contact page with the form HYDRATED. Waiting for `#contact form`
 * alone would be intermittently green: the page is prerendered, so the form
 * exists in the served HTML before React attaches, and a submit dispatched into
 * that window is silently ignored. React 18 stamps `__reactProps$<hash>` on
 * every node it hydrates that carries props, and this form carries three
 * handlers, so that key IS the hydration signal (a React internal, acceptable
 * because the failure mode is a loud timeout, never a false pass).
 *
 * One page per test: the sonner toast list and `typoAcknowledged` both live as
 * long as the page, so a test inheriting either would assert on leftovers.
 */
async function openForm() {
  const { page, errors } = await pageAt(browser);
  await page.goto(`${BASE}/contact`);
  await page.waitForFunction(
    () => {
      const form = document.querySelector("#contact form");
      return !!form && Object.keys(form).some((k) => k.startsWith("__reactProps$"));
    },
    null,
    { timeout: 20000 },
  );
  return { page, errors };
}

/**
 * Set a field the way a keystroke does: native value setter plus an `input`
 * event, so React's onChange runs and state actually updates. One mechanism for
 * every value, control characters and a 4,001-character message included, and
 * self-verifying: had it failed to reach React state, the validator would see
 * empty strings and every case below would report the required-fields error
 * instead of the rule under test.
 */
async function setField(page, id, value) {
  await page.evaluate(
    ([fieldId, next]) => {
      const el = document.getElementById(fieldId);
      const proto =
        el.tagName === "TEXTAREA"
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, next);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    [id, value],
  );
}

/** Fill the three required fields; `message` defaults to the short sentinel. */
async function fillValid(page, overrides = {}) {
  const values = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    role: "",
    message: TOO_SHORT,
    ...overrides,
  };
  for (const id of FIELDS) await setField(page, id, values[id]);
}

/** The accessibility contract, read in one round trip. */
function readState(page) {
  return page.evaluate((fields) => {
    const at = (id) => document.getElementById(id);
    const invalid = fields.filter((f) => at(f).getAttribute("aria-invalid") === "true");
    const alerts = {};
    for (const f of fields) {
      const node = at(`${f}-error`);
      if (node) alerts[f] = { role: node.getAttribute("role"), text: node.textContent };
    }
    return {
      invalid,
      alerts,
      describedBy: Object.fromEntries(
        fields.map((f) => [f, at(f).getAttribute("aria-describedby")]),
      ),
      focused: document.activeElement?.id ?? null,
      toasts: document.querySelectorAll("[data-sonner-toast]").length,
    };
  }, FIELDS);
}

async function dispatchSubmit(page) {
  await page.evaluate(() => {
    document
      .querySelector("#contact form")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

/**
 * Submit and wait for the failure to land on `field`. Polling, not a fixed sleep:
 * React flushes a discrete event synchronously today so this returns on the first
 * tick, while a sleep would be either flaky or wasted time.
 */
async function submitExpectingError(page, field) {
  await dispatchSubmit(page);
  await page
    .waitForFunction(
      (f) => document.getElementById(f).getAttribute("aria-invalid") === "true",
      field,
      { timeout: 3000 },
    )
    .catch(async () => {
      assert.fail(
        `expected #${field} to be marked invalid; got ${JSON.stringify(
          await readState(page),
        )}`,
      );
    });
  return readState(page);
}

/**
 * Submit and wait for client validation to COMPLETE without rejecting a field.
 * The observable end of the client path is a new toast: every field rule
 * satisfied, the handler falls through to the Turnstile gate and toasts about the
 * challenge. We assert a NEW toast appeared rather than matching its copy, since
 * which toast it is depends on whether the build has a site key (this one does
 * not), and because "a toast was pushed" is the half that proves the handler ran
 * to the end. Without it, "no field error" would also hold for a handler that
 * never fired.
 */
async function submitExpectingPass(page) {
  const before = (await readState(page)).toasts;
  await dispatchSubmit(page);
  await page
    .waitForFunction(
      (n) => document.querySelectorAll("[data-sonner-toast]").length > n,
      before,
      { timeout: 3000 },
    )
    .catch(async () => {
      assert.fail(
        `submit produced no new toast, so client validation did not run to the end; state ${JSON.stringify(
          await readState(page),
        )}`,
      );
    });
  const state = await readState(page);
  assert.deepEqual(
    state.invalid,
    [],
    `expected no field to be rejected, got ${JSON.stringify(state.alerts)}`,
  );
  assert.deepEqual(Object.keys(state.alerts), []);
  return state;
}

/**
 * The full accessibility contract for one rejected field: exactly one field is
 * marked, its reason is a role="alert" paragraph, aria-describedby points AT that
 * paragraph, and focus moved to the field. Which is why the suite asserts markup
 * rather than toast copy: the toast is a detached live region a screen reader
 * cannot associate with the input, the bug the inline message was added to fix.
 */
function assertFieldError(state, field) {
  assert.deepEqual(
    state.invalid,
    [field],
    `expected only #${field} invalid; state ${JSON.stringify(state)}`,
  );
  assert.deepEqual(Object.keys(state.alerts), [field]);
  assert.equal(state.alerts[field].role, "alert");
  assert.ok(state.alerts[field].text.trim().length > 0, "alert paragraph is empty");
  assert.equal(state.describedBy[field], `${field}-error`);
  for (const other of FIELDS.filter((f) => f !== field)) {
    assert.equal(state.describedBy[other], null, `#${other} kept a stale describedby`);
  }
  assert.equal(state.focused, field, "focus did not move to the offending field");
  return state.alerts[field].text;
}

/** A rejected field whose message quotes the bound it broke. */
function assertBoundError(state, field, bound) {
  assert.match(assertFieldError(state, field), new RegExp(String(bound)));
}

// --- the contract the rest of the suite reads on ------------------------------

test("a clean form advertises no error, and carries the ids the errors hang off", async () => {
  const { page } = await openForm();
  const state = await readState(page);
  assert.deepEqual(state.invalid, []);
  assert.deepEqual(Object.keys(state.alerts), []);
  for (const f of FIELDS) assert.equal(state.describedBy[f], null);
  // The email field's type is load-bearing for the native-gate test below.
  assert.equal(await page.evaluate(() => document.getElementById("email").type), "email");
  await page.close();
});

// --- required fields ---------------------------------------------------------

test("a whitespace-only required field is rejected: the server trims, so the client must too", async () => {
  const { page } = await openForm();
  // Spaces, not empty: an empty field is caught by the browser's own `required`
  // before React sees it, so whitespace is the shape that reaches this branch.
  await fillValid(page, { name: "   " });
  const text = assertFieldError(await submitExpectingError(page, "name"), "name");

  // One msgid covers every missing field, so the copy is compared ACROSS fields
  // rather than pinned as a string.
  await fillValid(page, { email: "" });
  assert.equal(assertFieldError(await submitExpectingError(page, "email"), "email"), text);

  await fillValid(page, { message: "   " });
  assert.equal(
    assertFieldError(await submitExpectingError(page, "message"), "message"),
    text,
  );
  await page.close();
});

test("the FIRST missing field is the one focused, not the last", async () => {
  const { page } = await openForm();
  // Both name and message are missing. Focus must go to name; a validator walking
  // them in the wrong order drops the visitor in the textarea, empty name behind.
  await fillValid(page, { name: "", message: "" });
  assertFieldError(await submitExpectingError(page, "name"), "name");
  await page.close();
});

// --- the tightened email rule ------------------------------------------------

// Shapes the OLD permissive rule accepted and the allowlist-after-parse refuses.
const REFUSED_EMAILS = [
  ["a@b.c", "a one-character TLD cannot receive mail"],
  ["x@y..z", "an empty domain label"],
  ["a@b.co.", "a trailing dot leaves no TLD (same case the Lambda suite pins)"],
  [".a@b.co", "a dot-atom local part may not start with a dot"],
  ["a.@b.co", "nor end with one"],
  ["a@-b.co", "a domain label may not start with a hyphen"],
  [`${"a".repeat(EMAIL_LOCAL_MAX + 1)}@example.com`, "local part over the RFC 5321 cap"],
];

test("every tightened email shape is refused with the field-level format error", async () => {
  const { page } = await openForm();

  // The reference copy, from a shape nobody would argue about. Comparing against
  // it keeps these cases independent of how the msgid is worded while still
  // proving they hit the FORMAT branch and not the length, control-char or
  // typo-suggestion branches, each of which says something different.
  await fillValid(page, { email: "not-an-email" });
  const formatError = assertFieldError(
    await submitExpectingError(page, "email"),
    "email",
  );

  for (const [email, why] of REFUSED_EMAILS) {
    await fillValid(page, { email });
    const text = assertFieldError(await submitExpectingError(page, "email"), "email");
    assert.equal(text, formatError, `${email}: ${why}`);
  }
  await page.close();
});

test(`a local part of exactly ${EMAIL_LOCAL_MAX} characters is accepted, one more is not`, async () => {
  const { page } = await openForm();
  // The boundary, because `>` against `>=` on EMAIL_LOCAL_MAX is a silent
  // one-address regression no realistic test address would ever surface.
  await fillValid(page, { email: `${"a".repeat(EMAIL_LOCAL_MAX)}@example.com` });
  assertFieldError(await submitExpectingError(page, "message"), "message");

  await fillValid(page, { email: `${"a".repeat(EMAIL_LOCAL_MAX + 1)}@example.com` });
  assertFieldError(await submitExpectingError(page, "email"), "email");
  await page.close();
});

const ACCEPTED_EMAILS = [
  ["first.last@mail.example.co.uk", "multi-label domain, two-part TLD"],
  ["ada+contact@example.io", "plus addressing"],
  ["MiXeD@Example.COM", "case is not a defect"],
  ["hi@xn--80ak6aa92e.com", "a punycode IDN domain"],
];

test("legitimate addresses still pass the tightened rule", async () => {
  const { page } = await openForm();
  for (const [email, why] of ACCEPTED_EMAILS) {
    await fillValid(page, { email });
    // Landing on #message (too short) is the proof that email PASSED. Had the
    // rule over-tightened, the error would sit on #email instead.
    const state = await submitExpectingError(page, "message");
    assertFieldError(state, "message");
    assert.equal(state.alerts.email, undefined, `${email} was rejected (${why})`);
  }
  await page.close();
});

test("three of the refused shapes are refused by NOTHING but this rule", async () => {
  const { page } = await openForm();
  // The evidence that tightening EMAIL_RE bought something: `type="email"`
  // already refuses two of the six shapes above, so a reader could reasonably
  // assume the platform covers the rest. It does not.
  const native = await page.evaluate((emails) => {
    const el = document.getElementById("email");
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set;
    const out = {};
    for (const e of emails) {
      setter.call(el, e);
      out[e] = el.checkValidity();
    }
    return out;
  }, ["a@b.c", ".a@b.co", "a.@b.co", "x@y..z", "a@-b.co"]);

  // Chrome says these are fine. Only EMAIL_RE stands between them and a reply the
  // visitor never receives.
  assert.equal(native["a@b.c"], true);
  assert.equal(native[".a@b.co"], true);
  assert.equal(native["a.@b.co"], true);
  // These two the platform also catches, which is the concrete reason the suite
  // dispatches a submit event instead of clicking: a click could never reach
  // EMAIL_RE with them.
  assert.equal(native["x@y..z"], false);
  assert.equal(native["a@-b.co"], false);
  await page.close();
});

// --- the domain-typo soft gate ----------------------------------------------

// One from each lookup table: `gmail.con` is a bad TLD on a good domain
// (EMAIL_TLD_TYPOS), `gmial.com` is a misspelt domain (EMAIL_DOMAIN_TYPOS).
const TYPOS = [
  ["ada@gmail.con", "ada@gmail.com"],
  ["ada@gmial.com", "ada@gmail.com"],
];

for (const [typed, suggested] of TYPOS) {
  test(`${typed} warns on the first submit and is ACCEPTED on the second`, async () => {
    const { page } = await openForm();
    await fillValid(page, { email: typed });

    // First submit: a question, raised on the email field. The suggested address
    // is computed from the input rather than being prose, so it is the part of
    // this message worth pinning.
    const first = assertFieldError(await submitExpectingError(page, "email"), "email");
    assert.ok(
      first.includes(suggested),
      `expected the corrected address in the warning, got ${JSON.stringify(first)}`,
    );

    // Second submit of the SAME value, nothing edited in between: the half a
    // warning-only test would miss. The error must MOVE ON to the next rule (the
    // short message), proving the address was let through rather than refused
    // again. Regressed, a visitor at a real but odd domain could never send.
    const second = await submitExpectingError(page, "message");
    assertFieldError(second, "message");
    assert.equal(second.alerts.email, undefined, "the typo warning blocked twice");
    assert.equal(second.describedBy.email, null);

    // And with a message that clears the minimum, the same twice-submitted
    // address reaches the end of client validation.
    await setField(page, "message", LONG_ENOUGH);
    await submitExpectingPass(page);
    await page.close();
  });
}

test("acknowledging one typo does not bless a different one typed afterwards", async () => {
  const { page } = await openForm();
  await fillValid(page, { email: "ada@gmail.con" });
  assertFieldError(await submitExpectingError(page, "email"), "email");

  // Editing the address re-arms the check, because the acknowledgement is held as
  // the VALUE rather than a boolean. A boolean would wave the second typo through.
  await setField(page, "email", "ada@gmial.com");
  const again = assertFieldError(await submitExpectingError(page, "email"), "email");
  assert.ok(again.includes("ada@gmail.com"));
  await page.close();
});

test("a correct address is never questioned, so one submit is enough", async () => {
  const { page } = await openForm();
  // The mirror image of the soft gate: gmail.com itself must not be suggested
  // against, or every real Gmail user would have to press send twice.
  await fillValid(page, { email: "ada@gmail.com", message: LONG_ENOUGH });
  await submitExpectingPass(page);
  await page.close();
});

// --- length bounds -----------------------------------------------------------

test("each field's length bound is enforced at exactly the documented limit", async () => {
  const { page } = await openForm();

  // One over: rejected, and the message states the bound (it interpolates the
  // constant, so the number is structural rather than copy). Exactly at the
  // bound: accepted, so the error moves on to the short message.
  await fillValid(page, { name: "n".repeat(NAME_MAX + 1) });
  assertBoundError(await submitExpectingError(page, "name"), "name", NAME_MAX);
  await fillValid(page, { name: "n".repeat(NAME_MAX) });
  assertFieldError(await submitExpectingError(page, "message"), "message");

  // The email length check runs BEFORE the format check, and this value fails
  // both. Reporting the length is the right answer: "too long" tells the visitor
  // what to do about it, "invalid" does not.
  await fillValid(page, { email: `${"e".repeat(EMAIL_MAX)}@example.com` });
  assertBoundError(await submitExpectingError(page, "email"), "email", EMAIL_MAX);

  // Role is optional but still bounded, and its check precedes the message
  // minimum, so with a short message too an over-long role must win.
  await fillValid(page, { role: "r".repeat(ROLE_MAX + 1) });
  assertBoundError(await submitExpectingError(page, "role"), "role", ROLE_MAX);
  await fillValid(page, { role: "r".repeat(ROLE_MAX) });
  assertFieldError(await submitExpectingError(page, "message"), "message");

  await fillValid(page, { message: "m".repeat(MESSAGE_MAX + 1) });
  assertBoundError(await submitExpectingError(page, "message"), "message", MESSAGE_MAX);
  await page.close();
});

test(`a message of ${MESSAGE_MIN - 1} characters is too short and one of ${MESSAGE_MIN} is not`, async () => {
  const { page } = await openForm();
  await fillValid(page, { message: "m".repeat(MESSAGE_MIN - 1) });
  assertBoundError(await submitExpectingError(page, "message"), "message", MESSAGE_MIN);
  // The boundary from the other side, which is what pins `<` rather than `<=`.
  await setField(page, "message", "m".repeat(MESSAGE_MIN));
  await submitExpectingPass(page);
  await page.close();
});

// --- control characters ------------------------------------------------------

test("control characters are refused, and the offending codepoints are named", async () => {
  const { page } = await openForm();
  // C0 plus DEL, and BOTH must be listed: the component reports codepoints so a
  // visitor who pasted out of a PDF sees what to delete. Naming only the first
  // would have them removing one invisible character per attempt.
  await fillValid(page, { name: `Ada${SOH}Lovelace${DEL}` });
  const text = assertFieldError(await submitExpectingError(page, "name"), "name");
  assert.match(text, /U\+0001/);
  assert.match(text, /U\+007F/);

  // On the email field the control-char check runs before the format check, so a
  // control character must be reported as itself rather than as a bad address.
  await fillValid(page, { email: `ada${SOH}@example.com` });
  const emailText = assertFieldError(await submitExpectingError(page, "email"), "email");
  assert.match(emailText, /U\+0001/);
  await page.close();
});

test("the message field allows newlines and tabs but not other controls", async () => {
  const { page } = await openForm();
  // The whole point of the allowNewlines branch: a multi-line enquiry is ordinary
  // text, and rejecting it would refuse most real messages.
  await fillValid(page, { message: "line one\n\tline two\r\nline three" });
  await submitExpectingPass(page);

  // Same field, a character the server forbids even in the message.
  await setField(page, "message", `hello${BEL} there, long enough`);
  const text = assertFieldError(await submitExpectingError(page, "message"), "message");
  assert.match(text, /U\+0007/);
  await page.close();
});

// --- noise -------------------------------------------------------------------

test("running the whole validation path logs no NEW console error", async () => {
  const { page, errors } = await openForm();
  // NOT an assertion that the console is clean. Measured on this build: loading
  // /contact already emits five React #418 hydration errors and one #422 before
  // anything is typed. That is a real defect, it belongs to whoever owns
  // hydration, and pinning zero here would fail for reasons unrelated to
  // validation. What this test CAN say is that no interaction below adds to the
  // pile, which is how a controlled/uncontrolled warning or a throw in the
  // validator would surface.
  const atLoad = errors.length;

  await fillValid(page, { name: "   " });
  await submitExpectingError(page, "name");
  await fillValid(page, { email: "a@b.c" });
  await submitExpectingError(page, "email");
  await fillValid(page, { email: "ada@gmail.con" });
  await submitExpectingError(page, "email");
  await submitExpectingError(page, "message");
  await fillValid(page, { message: "m".repeat(MESSAGE_MAX + 1) });
  await submitExpectingError(page, "message");
  await fillValid(page, { message: LONG_ENOUGH });
  await submitExpectingPass(page);

  assert.deepEqual(
    errors.slice(atLoad),
    [],
    "an interaction with the form logged a new console error",
  );
  await page.close();
});

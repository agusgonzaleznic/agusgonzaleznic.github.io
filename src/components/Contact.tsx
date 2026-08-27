import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Mail, Send, Linkedin, Github } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import {
  CONTACT_CTA_ID,
  SECTION_HEADER_MARGIN,
  SECTION_PADDING,
} from "@/lib/layout";
import { loadTurnstile } from "@/lib/turnstile";
import { BOOKING_URL } from "@/lib/booking";
import type { PageBlock } from "@/lib/pages";

// Same-origin endpoint (a CloudFront behavior in front of a Lambda). The Lambda
// runs every server-side control (schema, rate limits, Turnstile siteverify,
// honeypot, timing) and forwards the sanitized message on: the Google Apps
// Script URL lives server-side now and never ships in this bundle.
const CONTACT_ENDPOINT = "/api/contact";

// The POST reaches the Lambda Function URL through CloudFront with OAC/SigV4.
// For requests with a body, CloudFront folds the viewer-supplied
// x-amz-content-sha256 (hex SHA-256 of the exact body) into the signature it
// sends to the origin; if the viewer omits it or it doesn't match the body,
// Lambda rejects with 403 "signature does not match". It's a SIGNED header, so
// it must NOT appear in the origin request policy (CloudFront rejects that).
// Same-origin request → no CORS preflight despite the custom header.
async function sha256Hex(body: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(body),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Client-side validation limits: MIRROR the Lambda schema (control 4,
// `validate()` in terraform/contact-lambda-src/index.mjs). Everything is
// checked against the TRIMMED value, exactly as the server does, so anything
// that passes here also passes there. We only enforce what the server enforces:
// length bounds + rejection of control characters. Ordinary text (apostrophes,
// accents, punctuation, and newlines in the message) is never rejected.
const NAME_MAX = 100;
const EMAIL_MAX = 200;
const ROLE_MAX = 100;
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 4000;
// HAND-SYNCED PAIR with MAX_BODY_BYTES in terraform/contact-lambda-src/index.mjs.
// Nothing can enforce it: that Lambda is a separate module the client cannot
// import from. Keep this <= the server's value.
//
// It has to be checked here as well as there because the two limits are in
// DIFFERENT UNITS: MESSAGE_MAX counts characters, the server caps UTF-8 bytes.
// A 4,000-character message is ~4 KB in ASCII but ~12 KB in CJK, so without this
// check a Japanese or Russian visitor could pass every visible validation and
// still get a 413 the form never warned about: a silently lost enquiry from
// exactly the visitor least likely to retry in English.
const MAX_BODY_BYTES = 16384;

// HAND-SYNCED PAIR with EMAIL_RE + EMAIL_LOCAL_MAX in
// terraform/contact-lambda-src/index.mjs. Nothing can enforce the pairing (the
// Lambda is a separate module the client cannot import from), so the two must be
// edited together. Keep this rule NO STRICTER than the server's, or the form
// would refuse an address the server would have accepted.
//
// A pragmatic subset of RFC 5322: dot-atom local part, dot-separated domain
// whose labels start and end alphanumeric, alphabetic TLD of 2-63. The rule this
// replaced only asked for "something @ something . something", which accepted
// `a@b.c`, `x@y..z` and `.a@b.co`, none of which can receive mail.
//
// Worth being clear about what this does and does not buy: validating here helps
// the person typing (a typo means a reply they never get), but it turns away no
// spam at all, because anything posting straight to /api/contact never runs this
// file. The tightened server-side copy is what rejects junk.
const EMAIL_RE =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
const EMAIL_LOCAL_MAX = 64; // RFC 5321 caps the local part at 64 octets.

// Exact-match misspellings of the domains most enquirers actually use. A typo'd
// address is syntactically perfect and passes every check above, so the only way
// it surfaces is by asking. Exact matches only, deliberately: a fuzzy-distance
// check would eventually "correct" somebody's real company domain.
//
// Note what is NOT here: a bare `.co` or `.cm` suggestion. Both are real TLDs
// (Colombia, Cameroon), so they appear only as part of a full domain whose brand
// is unmistakable.
const EMAIL_DOMAIN_TYPOS: Record<string, string> = {
  "gmai.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gmali.com": "gmail.com",
  "gmil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.cm": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "outlok.com": "outlook.com",
  "outllok.com": "outlook.com",
  "outook.com": "outlook.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yhaoo.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "iclod.com": "icloud.com",
  "icloud.co": "icloud.com",
  "iclould.com": "icloud.com",
  "protonmai.com": "protonmail.com",
  "protonmail.co": "protonmail.com",
};

// TLDs that are never real, so they are safe to suggest against for ANY domain.
const EMAIL_TLD_TYPOS: Record<string, string> = { con: "com", cmo: "com", comm: "com" };

/**
 * A corrected address to offer for `email`, or null when it looks fine. Assumes
 * `email` already passed EMAIL_RE, so it has exactly one @ and a dotted domain.
 */
function suggestEmailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();

  const exact = EMAIL_DOMAIN_TYPOS[domain];
  if (exact) return `${local}@${exact}`;

  const lastDot = domain.lastIndexOf(".");
  const fixedTld = EMAIL_TLD_TYPOS[domain.slice(lastDot + 1)];
  if (fixedTld) return `${local}@${domain.slice(0, lastDot + 1)}${fixedTld}`;

  return null;
}

// How long to wait for /api/contact before giving up on the response. Above the
// Lambda's own 10 s ceiling on purpose: below it, this would abort requests the
// server is still legitimately working on and report them as lost. Reaching this
// means the response really is gone.
const SUBMIT_TIMEOUT_MS = 20000;

// The Lambda rejects C0 control chars + DEL (its CTRL_ANY); the message field
// additionally tolerates tab/newline/carriage-return (its CTRL_MULTILINE). We
// detect them by codepoint (no control-char regex) and return the offending
// ones as U+XXXX codes so the visitor can see exactly what to remove.
function findControlChars(value: string, allowNewlines: boolean): string[] {
  const seen = new Set<string>();
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;
    const isControl = code <= 0x1f || code === 0x7f;
    if (!isControl) continue;
    if (allowNewlines && (ch === "\t" || ch === "\n" || ch === "\r")) continue;
    seen.add(`U+${code.toString(16).toUpperCase().padStart(4, "0")}`);
  }
  return [...seen];
}

// Only the MARKETING copy (header + info cards) is CMS-managed. The form, its
// labels/placeholders/validation/toasts, the Turnstile flow, and every URL stay
// in code (security-critical / functional), rendered via Lingui as before.
export interface ContactBlock extends PageBlock {
  heading?: string;
  subheading?: string;
  get_in_touch_heading?: string;
  response_time_heading?: string;
  response_time_text?: string;
  discovery_call_heading?: string;
  discovery_call_text?: string;
}

export const Contact = ({ block }: { block?: ContactBlock }) => {
  const { t } = useLingui();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    role: "",
    message: "",
  });
  // Honeypot: real users never see or fill this; a non-empty value is a bot
  // signal that the server drops (still returning 200 so bots learn nothing).
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // The field that failed validation AND the reason, so the reason can be
  // rendered next to the field and referenced by aria-describedby.
  //
  // It used to be the field id alone: the input got aria-invalid and focus, and
  // the explanation went to a toast. A screen-reader user landing on the field
  // was told it was invalid and not why: the toast is a separate live region
  // with no relationship to the input, and it disappears. WCAG 3.3.1 wants the
  // error identified in text; 3.3.3 wants the suggestion available.
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const errorFor = (field: string) => (fieldError?.field === field ? fieldError.message : null);

  // Turnstile widget state. The token is single-use and short-lived; the submit
  // button stays disabled until one is present, and it is cleared on expiry,
  // error, and after every submit attempt.
  // The address whose domain-typo warning the visitor has already seen and
  // chosen to keep. Holding the VALUE rather than a boolean means correcting the
  // address re-arms the check, and confirming it does not silently bless a
  // different typo typed afterwards.
  const [typoAcknowledged, setTypoAcknowledged] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState(false);
  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const initTriggeredRef = useRef(false);

  // Load api.js + render the widget. Idempotent: only the first interaction with
  // the form does any work, so a visitor who merely reads the page never touches
  // Cloudflare at all.
  const initTurnstile = useCallback(() => {
    if (initTriggeredRef.current) return;
    initTriggeredRef.current = true;

    const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    if (!sitekey) {
      setTurnstileError(true);
      return;
    }

    loadTurnstile()
      .then((turnstile) => {
        if (!widgetContainerRef.current || widgetIdRef.current) return;
        widgetIdRef.current = turnstile.render(widgetContainerRef.current, {
          sitekey,
          action: "contact",
          callback: (token) => {
            setTurnstileToken(token);
            setTurnstileError(false);
          },
          "expired-callback": () => setTurnstileToken(null),
          "timeout-callback": () => setTurnstileToken(null),
          "error-callback": () => {
            setTurnstileToken(null);
            setTurnstileError(true);
          },
          // Site is light-only (no ThemeProvider, no `.dark` class ever set),
          // so pin the widget to light rather than following the visitor's OS.
          theme: "light",
        });
      })
      .catch(() => setTurnstileError(true));
  }, []);

  // The only trigger is a real interaction with the form, wired on the <form>
  // element itself (see onFocus/onPointerDown below).
  //
  // There used to be a second trigger that loaded the widget once the form came
  // within 200px of the viewport. On /contact the form is above the fold, so
  // that fired during initial layout and every visitor hit Cloudflare whether or
  // not they intended to write anything. Turnstile then runs its fingerprinting
  // probes on load, which is both a privacy cost the visitor did not opt into
  // and around fifty console messages on a page nobody has touched. Waiting for
  // an interaction costs nothing: filling three required fields takes far longer
  // than the challenge needs to solve, so the token is ready before the message
  // is, and the container below reserves its height either way so nothing
  // shifts when the widget appears.

  // Tear the widget down on unmount so a remount renders a fresh one.
  useEffect(() => {
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* widget already gone */
        }
        widgetIdRef.current = null;
      }
    };
  }, []);

  const resetTurnstile = () => {
    setTurnstileToken(null);
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {
        /* reset best-effort */
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);

    // Toast + inline message + focus in one place. Ten validation branches used
    // to pair a toast.error() with a separate focusInvalid(), which is how the
    // two could disagree about which field was at fault.
    const failField = (field: string, message: string) => {
      toast.error(message);
      setFieldError({ field, message });
      document.getElementById(field)?.focus();
    };

    // Field-level validation: each failure says exactly what's wrong and puts
    // focus on the offending field. We validate the TRIMMED value and mirror the
    // Lambda schema so the client never rejects anything the server would accept
    // (or vice versa). See findControlChars + the *_MAX/*_MIN constants above.
    const name = formData.name.trim();
    const email = formData.email.trim();
    const role = formData.role.trim();
    const message = formData.message.trim();

    // Required fields first: focus the first empty one.
    if (!name || !email || !message) {
      failField(
        !name ? "name" : !email ? "email" : "message",
        t`Please fill in all required fields`,
      );
      return;
    }

    // Shared handler for the server's control-character rule. Returns true (and
    // toasts + focuses) when the field carries characters the server forbids.
    const rejectControlChars = (field: string, chars: string[]): boolean => {
      if (chars.length === 0) return false;
      const list = chars.join(", ");
      failField(
        field,
        t`Please remove these characters — they aren't allowed for security reasons: ${list}`,
      );
      return true;
    };

    // Name: length bound + control chars.
    if (name.length > NAME_MAX) {
      failField("name", t`Your name is too long — please use ${NAME_MAX} characters or fewer.`);
      return;
    }
    if (rejectControlChars("name", findControlChars(name, false))) return;

    // Email: length bound, control chars, then format.
    if (email.length > EMAIL_MAX) {
      failField("email", t`Your email is too long — please use ${EMAIL_MAX} characters or fewer.`);
      return;
    }
    if (rejectControlChars("email", findControlChars(email, false))) return;
    if (
      !EMAIL_RE.test(email) ||
      email.slice(0, email.lastIndexOf("@")).length > EMAIL_LOCAL_MAX
    ) {
      failField("email", t`Please enter a valid email address`);
      return;
    }
    // A domain typo is syntactically valid, so it can only be raised as a
    // question. Blocking the first attempt and letting the second through keeps
    // the check from ever permanently refusing a real address the server accepts:
    // somebody genuinely at an unusual domain just presses send again.
    const suggestion = suggestEmailDomain(email);
    if (suggestion && typoAcknowledged !== email) {
      setTypoAcknowledged(email);
      failField(
        "email",
        t`Did you mean ${suggestion}? Press send again to use the address exactly as you typed it.`,
      );
      return;
    }

    // Role: optional, but the server still bounds its length + rejects controls.
    if (role.length > ROLE_MAX) {
      failField("role", t`Your role is too long — please use ${ROLE_MAX} characters or fewer.`);
      return;
    }
    if (rejectControlChars("role", findControlChars(role, false))) return;

    // Message: minimum + maximum length, then control chars (newlines allowed).
    if (message.length < MESSAGE_MIN) {
      failField("message", t`Your message is too short — please write at least ${MESSAGE_MIN} characters.`);
      return;
    }
    if (message.length > MESSAGE_MAX) {
      failField("message", t`Your message is too long — please use ${MESSAGE_MAX} characters or fewer.`);
      return;
    }
    if (rejectControlChars("message", findControlChars(message, true))) return;

    if (!turnstileToken) {
      toast.error(t`Please complete the verification challenge and try again.`);
      return;
    }

    setIsSubmitting(true);

    // Set when OUR timeout fired, so the catch below can tell an abort we caused
    // from a network failure. Declared out here because the catch needs it.
    let timedOut = false;

    try {
      // The server derives the minimum-completion-time check from the Turnstile
      // token's `challenge_ts` (it can't trust a client clock), so no separate
      // "renderedAt" timestamp is sent, only the token.
      const body = JSON.stringify({
        name: formData.name,
        email: formData.email,
        role: formData.role,
        message: formData.message,
        company_website: companyWebsite, // honeypot (empty for humans)
        turnstileToken, // key must match the Lambda schema (index.mjs ALLOWED_KEYS)
      });

      // Measure what we are ACTUALLY about to send (the encoded payload,
      // including the ~2 KB Turnstile token) against the server's byte cap, so
      // the user is told before submitting rather than getting an opaque 413.
      const bodyBytes = new TextEncoder().encode(body).length;
      if (bodyBytes > MAX_BODY_BYTES) {
        failField(
          "message",
          t`Your message is too long to send. Please shorten it and try again.`,
        );
        // No setIsSubmitting(false) here: the enclosing finally already clears
        // it AND resets the single-use Turnstile token, which a bare return
        // must not skip or the retry would reuse a spent token.
        return;
      }

      // Bound the wait. Without this the request could hang for as long as the
      // browser's own default allows, leaving the button spinning with no
      // outcome either way. AbortController rather than AbortSignal.timeout so
      // the reason for the abort is ours to read in the catch below.
      const controller = new AbortController();
      timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, SUBMIT_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(CONTACT_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Required for CloudFront's OAC SigV4 signature over the body.
            "x-amz-content-sha256": await sha256Hex(body),
          },
          body,
          signal: controller.signal,
        });
      } finally {
        // Always clear it: a resolved fetch would otherwise leave a pending
        // timer that fires abort() on an already-settled request.
        clearTimeout(timer);
      }

      // The server always replies with JSON; tolerate an empty/garbled body.
      const data = await response.json().catch(() => ({}) as { error?: string });

      if (response.ok) {
        toast.success(t`Message sent — I typically reply within 24 hours.`);
        setFormData({ name: "", email: "", role: "", message: "" });
        setCompanyWebsite("");
        return;
      }

      // NEVER show `data.error` to the user. Every non-2xx value the Lambda
      // returns is a machine code ("invalid", "forbidden", "too_large",
      // "rate_limited", "delivery"), not prose, so `data.error || t\`...\``
      // meant the localized fallback was DEAD on every real API error and a
      // German or Japanese visitor got a bare English token. The code is useful
      // for debugging, so it goes to the console.
      if (data?.error) {
        console.error(`/api/contact ${response.status}: ${data.error}`);
      }

      switch (response.status) {
        case 400:
          toast.error(t`Some details look off. Please check the form and try again.`);
          break;
        case 403:
          toast.error(t`Verification failed. Please complete the challenge and try again.`);
          break;
        case 413:
          toast.error(
            t`That message is too long to send. Please shorten it and try again.`,
          );
          break;
        case 429: {
          // The Lambda returns `retryAfter` (seconds) in the body and a
          // `Retry-After` header; prefer the body, fall back to the header.
          const retryAfter = Number(
            data.retryAfter ?? response.headers.get("retry-after"),
          );
          if (Number.isFinite(retryAfter) && retryAfter > 0) {
            const seconds = Math.round(retryAfter);
            const wait =
              seconds < 60
                ? plural(seconds, { one: "# second", other: "# seconds" })
                : plural(Math.ceil(seconds / 60), {
                    one: "about # minute",
                    other: "about # minutes",
                  });
            toast.error(
              t`Too many requests — please wait ${wait} before trying again, or email me directly.`,
            );
          } else {
            toast.error(t`Too many requests. Please wait a moment, or email me directly.`);
          }
          break;
        }
        default:
          toast.error(t`Failed to send message. Please try again or email me directly.`);
      }
    } catch (error) {
      // Reaching here means no response was ever read, which is NOT the same as
      // the message having failed. The request may have arrived, passed all ten
      // controls and been handed to SES, with only the reply lost on the way
      // back: SES has accepted every send this endpoint has ever attempted, so
      // a dropped response is the likelier reading of the two. Claiming "failed
      // to send" here told people their message was gone when it had in fact
      // been delivered, and invited a duplicate they did not need to send.
      //
      // So: say what is actually known, and steer away from an immediate retry
      // rather than towards one. The typed message is deliberately left in the
      // form: it is the visitor's only copy.
      console.error("Form submission error:", error, { timedOut });
      toast.warning(
        t`I could not confirm whether your message went through — it may already have arrived. Please wait a moment before trying again, or email me directly.`,
      );
    } finally {
      // The Turnstile token is single-use; always clear + reset the widget so a
      // retry starts from a fresh challenge.
      resetTurnstile();
      setIsSubmitting(false);
    }
  };

  if (block?.show_section === false) return null;
  return (
    <section id="contact" className={`${SECTION_PADDING} bg-background`}>
      <div className="container px-6">
        <div className="max-w-5xl mx-auto">
          {/* Section header */}
          <div className={`text-center max-w-3xl mx-auto ${SECTION_HEADER_MARGIN} animate-fade-in-up`}>
            <h1 className="text-fluid-3xl font-bold mb-6">
              {block?.heading ?? <Trans>What's the Hardest Part of the Job Right Now?</Trans>}
            </h1>
            <p className="text-fluid-lg text-muted-foreground">
              {block?.subheading ?? (
                <Trans>Tell me in a few lines — a stalled team, a rough transition, a decision you keep circling. That's exactly what a first conversation is for.</Trans>
              )}
            </p>
          </div>

          <div className="grid lg:grid-cols-5 gap-12">
            {/* Contact form */}
            <Card className="lg:col-span-3 p-8 animate-fade-in-up delay-100">
              {/*
                Both handlers are on the <form> and both bubble, so any field
                inside it arms the widget. onFocus (React delegates it to
                focusin) covers keyboard and assistive-tech users tabbing in;
                onPointerDown covers mouse and touch, and fires a moment earlier
                than focus does, including on a tap that lands on a label or the
                padding rather than an input.
              */}
              <form
                onSubmit={handleSubmit}
                onFocus={initTurnstile}
                onPointerDown={initTurnstile}
                className="space-y-6"
              >
                <div>
                  <Label htmlFor="name"><Trans>Name *</Trans></Label>
                  <Input
                    id="name"
                    name="name"
                    autoComplete="name"
                    value={formData.name}
                    onChange={(e) => {
                      setFieldError(null);
                      setFormData({ ...formData, name: e.target.value });
                    }}
                    placeholder={t`Your full name`}
                    required
                    aria-invalid={errorFor("name") !== null}
                    aria-describedby={errorFor("name") ? "name-error" : undefined}
                    className="mt-2"
                  />
                  {errorFor("name") && (
                    // role="alert" so the reason is announced on failure, and the id is
                    // what aria-describedby above points at, so a screen reader reads the
                    // reason WITH the field instead of only "invalid".
                    <p id="name-error" role="alert" className="mt-2 text-sm text-destructive">
                      {errorFor("name")}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="email"><Trans>Email *</Trans></Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={formData.email}
                    onChange={(e) => {
                      setFieldError(null);
                      setFormData({ ...formData, email: e.target.value });
                    }}
                    placeholder="you@yourcompany.com"
                    required
                    aria-invalid={errorFor("email") !== null}
                    aria-describedby={errorFor("email") ? "email-error" : undefined}
                    className="mt-2"
                  />
                  {errorFor("email") && (
                    // role="alert" so the reason is announced on failure, and the id is
                    // what aria-describedby above points at, so a screen reader reads the
                    // reason WITH the field instead of only "invalid".
                    <p id="email-error" role="alert" className="mt-2 text-sm text-destructive">
                      {errorFor("email")}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="role"><Trans>Current Role</Trans></Label>
                  <Input
                    id="role"
                    name="role"
                    autoComplete="organization-title"
                    value={formData.role}
                    onChange={(e) => {
                      setFieldError(null);
                      setFormData({ ...formData, role: e.target.value });
                    }}
                    placeholder={t`e.g., Engineering Manager, VP of Engineering`}
                    aria-invalid={errorFor("role") !== null}
                    aria-describedby={errorFor("role") ? "role-error" : undefined}
                    className="mt-2"
                  />
                  {errorFor("role") && (
                    // role="alert" so the reason is announced on failure, and the id is
                    // what aria-describedby above points at, so a screen reader reads the
                    // reason WITH the field instead of only "invalid".
                    <p id="role-error" role="alert" className="mt-2 text-sm text-destructive">
                      {errorFor("role")}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="message"><Trans>What would you like help with? *</Trans></Label>
                  <Textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => {
                      setFieldError(null);
                      setFormData({ ...formData, message: e.target.value });
                    }}
                    placeholder={t`Tell me about your current challenges or goals...`}
                    required
                    aria-invalid={errorFor("message") !== null}
                    aria-describedby={errorFor("message") ? "message-error" : undefined}
                    className="mt-2 min-h-32"
                  />
                  {errorFor("message") && (
                    // role="alert" so the reason is announced on failure, and the id is
                    // what aria-describedby above points at, so a screen reader reads the
                    // reason WITH the field instead of only "invalid".
                    <p id="message-error" role="alert" className="mt-2 text-sm text-destructive">
                      {errorFor("message")}
                    </p>
                  )}
                </div>

                {/*
                  Honeypot. Off-screen and hidden from assistive tech + the tab
                  order; bots that auto-fill every field will populate it and the
                  server silently drops those submissions.
                */}
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: "-9999px",
                    top: "auto",
                    width: "1px",
                    height: "1px",
                    overflow: "hidden",
                  }}
                >
                  <label htmlFor="company_website">Company Website</label>
                  <input
                    id="company_website"
                    name="company_website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={companyWebsite}
                    onChange={(e) => setCompanyWebsite(e.target.value)}
                  />
                </div>

                {/* Turnstile widget renders here once lazily loaded. */}
                <div>
                  <div ref={widgetContainerRef} className="min-h-[65px]" />
                  {turnstileError && (
                    <p className="mt-2 text-sm text-destructive" role="alert">
                      <Trans>Verification isn't available right now — please email me
                      directly at info@agusgonzaleznic.com.</Trans>
                    </p>
                  )}
                </div>

                <Button
                  id={CONTACT_CTA_ID}
                  type="submit"
                  size="lg"
                  className="w-full bg-accent hover:bg-accent-hover text-accent-foreground shadow-accent"
                  disabled={isSubmitting || !turnstileToken}
                >
                  {isSubmitting ? t`Sending...` : t`Send Message`}
                  <Send className="ml-2 h-5 w-5" />
                </Button>

                {/*
                  Quiet "or" divider + a secondary, outline booking button. This
                  is the intentional replacement for the mobile floating CTA
                  (removed from /contact separately). It's a real crawlable
                  anchor placed AFTER the submit button, so it never submits the
                  form, and its outline styling keeps the accent "Send Message"
                  primary as the dominant action.
                */}
                <div className="flex items-center gap-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground"><Trans>or</Trans></span>
                  <span className="h-px flex-1 bg-border" />
                </div>

                <Button asChild variant="outline" size="lg" className="w-full">
                  <a href={BOOKING_URL} target="_blank" rel="noopener noreferrer">
                    <Trans>Book a call</Trans>
                  </a>
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  <Trans>By submitting, you agree to being contacted about coaching services. Your information is kept confidential.</Trans>
                </p>
              </form>
            </Card>

            {/* Contact info */}
            <div className="lg:col-span-2 space-y-6 animate-fade-in-up delay-200">
              <Card className="p-6 border-2">
                <h2 className="font-bold mb-4">{block?.get_in_touch_heading ?? <Trans>Get in Touch</Trans>}</h2>
                <div className="space-y-4">
                  <a
                    href="mailto:info@agusgonzaleznic.com"
                    className="flex items-center gap-3 text-muted-foreground hover:text-accent transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                      <Mail className="w-5 h-5" />
                    </div>
                    <span className="text-sm break-all">info@agusgonzaleznic.com</span>
                  </a>

                  <a
                    href="https://www.linkedin.com/in/agusgonzaleznic/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-muted-foreground hover:text-accent transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                      <Linkedin className="w-5 h-5" />
                    </div>
                    <span className="text-sm"><Trans>LinkedIn Profile</Trans></span>
                  </a>

                  <a
                    href="https://github.com/agusgonzaleznic"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-muted-foreground hover:text-accent transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                      <Github className="w-5 h-5" />
                    </div>
                    <span className="text-sm"><Trans>GitHub Profile</Trans></span>
                  </a>
                </div>
              </Card>

              <Card className="p-6 bg-accent/5 border-accent/20">
                <h2 className="font-bold mb-3 text-foreground">{block?.response_time_heading ?? <Trans>Response Time</Trans>}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {block?.response_time_text ?? (
                    <Trans>I typically respond within 24 hours. For urgent inquiries, please mention it in your message.</Trans>
                  )}
                </p>
              </Card>

              <Card className="p-6 bg-primary/5 border-primary/20">
                <h2 className="font-bold mb-3 text-foreground">{block?.discovery_call_heading ?? <Trans>Free Discovery Call</Trans>}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {block?.discovery_call_text ?? (
                    <Trans>The first 30 minutes are on me: a working session on your situation, not a sales pitch. If I'm not the right coach for the problem, I'll say so.</Trans>
                  )}
                </p>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

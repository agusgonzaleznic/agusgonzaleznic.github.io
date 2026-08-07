import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Mail, Send, Linkedin, Github } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  CONTACT_CTA_ID,
  SECTION_HEADER_MARGIN,
  SECTION_PADDING,
} from "@/lib/layout";
import { loadTurnstile } from "@/lib/turnstile";
import type { PageBlock } from "@/lib/pages";

// Same-origin endpoint (a CloudFront behavior in front of a Lambda). The Lambda
// runs every server-side control (schema, rate limits, Turnstile siteverify,
// honeypot, timing) and forwards the sanitized message on — the Google Apps
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

// Client-side validation limits — MIRROR the Lambda schema (control 4,
// `validate()` in terraform/contact-lambda-src/index.mjs). Everything is
// checked against the TRIMMED value, exactly as the server does, so anything
// that passes here also passes there. We only enforce what the server enforces:
// length bounds + rejection of control characters. Ordinary text — apostrophes,
// accents, punctuation, and newlines in the message — is never rejected.
const NAME_MAX = 100;
const EMAIL_MAX = 200;
const ROLE_MAX = 100;
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 4000;

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
  // Id of the field that failed validation, for focus + aria-invalid so
  // keyboard/screen-reader users are taken to it, not left with only a toast.
  const [invalidField, setInvalidField] = useState<string | null>(null);

  // Turnstile widget state. The token is single-use and short-lived; the submit
  // button stays disabled until one is present, and it is cleared on expiry,
  // error, and after every submit attempt.
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
    setInvalidField(null);

    const focusInvalid = (field: string) => {
      setInvalidField(field);
      document.getElementById(field)?.focus();
    };

    // Field-level validation — each failure says exactly what's wrong and puts
    // focus on the offending field. We validate the TRIMMED value and mirror the
    // Lambda schema so the client never rejects anything the server would accept
    // (or vice versa). See findControlChars + the *_MAX/*_MIN constants above.
    const name = formData.name.trim();
    const email = formData.email.trim();
    const role = formData.role.trim();
    const message = formData.message.trim();

    // Required fields first — focus the first empty one.
    if (!name || !email || !message) {
      toast.error(t`Please fill in all required fields`);
      focusInvalid(!name ? "name" : !email ? "email" : "message");
      return;
    }

    // Shared handler for the server's control-character rule. Returns true (and
    // toasts + focuses) when the field carries characters the server forbids.
    const rejectControlChars = (field: string, chars: string[]): boolean => {
      if (chars.length === 0) return false;
      const list = chars.join(", ");
      toast.error(
        t`Please remove these characters — they aren't allowed for security reasons: ${list}`,
      );
      focusInvalid(field);
      return true;
    };

    // Name: length bound + control chars.
    if (name.length > NAME_MAX) {
      toast.error(
        t`Your name is too long — please use ${NAME_MAX} characters or fewer.`,
      );
      focusInvalid("name");
      return;
    }
    if (rejectControlChars("name", findControlChars(name, false))) return;

    // Email: length bound, control chars, then format.
    if (email.length > EMAIL_MAX) {
      toast.error(
        t`Your email is too long — please use ${EMAIL_MAX} characters or fewer.`,
      );
      focusInvalid("email");
      return;
    }
    if (rejectControlChars("email", findControlChars(email, false))) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error(t`Please enter a valid email address`);
      focusInvalid("email");
      return;
    }

    // Role: optional, but the server still bounds its length + rejects controls.
    if (role.length > ROLE_MAX) {
      toast.error(
        t`Your role is too long — please use ${ROLE_MAX} characters or fewer.`,
      );
      focusInvalid("role");
      return;
    }
    if (rejectControlChars("role", findControlChars(role, false))) return;

    // Message: minimum + maximum length, then control chars (newlines allowed).
    if (message.length < MESSAGE_MIN) {
      toast.error(
        t`Your message is too short — please write at least ${MESSAGE_MIN} characters.`,
      );
      focusInvalid("message");
      return;
    }
    if (message.length > MESSAGE_MAX) {
      toast.error(
        t`Your message is too long — please use ${MESSAGE_MAX} characters or fewer.`,
      );
      focusInvalid("message");
      return;
    }
    if (rejectControlChars("message", findControlChars(message, true))) return;

    if (!turnstileToken) {
      toast.error(t`Please complete the verification challenge and try again.`);
      return;
    }

    setIsSubmitting(true);

    try {
      // The server derives the minimum-completion-time check from the Turnstile
      // token's `challenge_ts` (it can't trust a client clock), so no separate
      // "renderedAt" timestamp is sent — only the token.
      const body = JSON.stringify({
        name: formData.name,
        email: formData.email,
        role: formData.role,
        message: formData.message,
        company_website: companyWebsite, // honeypot (empty for humans)
        turnstileToken, // key must match the Lambda schema (index.mjs ALLOWED_KEYS)
      });

      const response = await fetch(CONTACT_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Required for CloudFront's OAC SigV4 signature over the body.
          "x-amz-content-sha256": await sha256Hex(body),
        },
        body,
      });

      // The server always replies with JSON; tolerate an empty/garbled body.
      const data = await response.json().catch(() => ({}) as { error?: string });

      if (response.ok) {
        toast.success(t`Message sent — I typically reply within 24 hours.`);
        setFormData({ name: "", email: "", role: "", message: "" });
        setCompanyWebsite("");
        return;
      }

      switch (response.status) {
        case 400:
          toast.error(
            data.error ||
              t`Some details look off. Please check the form and try again.`,
          );
          break;
        case 403:
          toast.error(
            data.error ||
              t`Verification failed. Please complete the challenge and try again.`,
          );
          break;
        case 429:
          toast.error(
            data.error ||
              t`Too many requests. Please wait a moment, or email me directly.`,
          );
          break;
        default:
          toast.error(
            data.error ||
              t`Failed to send message. Please try again or email me directly.`,
          );
      }
    } catch (error) {
      console.error("Form submission error:", error);
      toast.error(
        t`Failed to send message. Please try again or email me directly.`,
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
                      setInvalidField(null);
                      setFormData({ ...formData, name: e.target.value });
                    }}
                    placeholder={t`Your full name`}
                    required
                    aria-invalid={invalidField === "name"}
                    className="mt-2"
                  />
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
                      setInvalidField(null);
                      setFormData({ ...formData, email: e.target.value });
                    }}
                    placeholder="you@yourcompany.com"
                    required
                    aria-invalid={invalidField === "email"}
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="role"><Trans>Current Role</Trans></Label>
                  <Input
                    id="role"
                    name="role"
                    autoComplete="organization-title"
                    value={formData.role}
                    onChange={(e) => {
                      setInvalidField(null);
                      setFormData({ ...formData, role: e.target.value });
                    }}
                    placeholder={t`e.g., Engineering Manager, VP of Engineering`}
                    aria-invalid={invalidField === "role"}
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="message"><Trans>What would you like help with? *</Trans></Label>
                  <Textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => {
                      setInvalidField(null);
                      setFormData({ ...formData, message: e.target.value });
                    }}
                    placeholder={t`Tell me about your current challenges or goals...`}
                    required
                    aria-invalid={invalidField === "message"}
                    className="mt-2 min-h-32"
                  />
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

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
  const formRef = useRef<HTMLFormElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const initTriggeredRef = useRef(false);

  // Load api.js + render the widget. Idempotent: only the first trigger (viewport
  // proximity or first field focus) does any work, so nothing third-party loads
  // at initial page load.
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

  // Lazy trigger #1: load when the form nears the viewport.
  useEffect(() => {
    const target = formRef.current;
    if (!target || typeof IntersectionObserver === "undefined") {
      initTurnstile();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          initTurnstile();
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [initTurnstile]);

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

    // Basic validation — focus the first offending field.
    if (!formData.name || !formData.email || !formData.message) {
      toast.error(t`Please fill in all required fields`);
      focusInvalid(!formData.name ? "name" : !formData.email ? "email" : "message");
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast.error(t`Please enter a valid email address`);
      focusInvalid("email");
      return;
    }

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
              <form
                ref={formRef}
                onSubmit={handleSubmit}
                onFocus={initTurnstile}
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
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    placeholder={t`e.g., Engineering Manager, VP of Engineering`}
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

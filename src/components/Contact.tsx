import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Mail, Send, Linkedin, Github } from "lucide-react";
import {
  CONTACT_CTA_ID,
  SECTION_HEADER_MARGIN,
  SECTION_PADDING,
} from "@/lib/layout";
import { loadTurnstile } from "@/lib/turnstile";

// Same-origin endpoint (a CloudFront behavior in front of a Lambda). The Lambda
// runs every server-side control (schema, rate limits, Turnstile siteverify,
// honeypot, timing) and forwards the sanitized message on — the Google Apps
// Script URL lives server-side now and never ships in this bundle.
const CONTACT_ENDPOINT = "/api/contact";

// Hex SHA-256 of the exact request body. Required because the POST reaches the
// Lambda Function URL through CloudFront with SigV4/OAC: AWS signs the request
// and Lambda rejects unsigned payloads, so the browser must send the payload
// hash in `x-amz-content-sha256`. We hash the same string we send as the body.
// NOTE FOR INFRA: the CloudFront origin request policy MUST forward the
// `x-amz-content-sha256` header to the origin, or every POST fails with 403.
async function sha256Hex(body: string): Promise<string> {
  const bytes = new TextEncoder().encode(body);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const Contact = () => {
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
      toast.error("Please fill in all required fields");
      focusInvalid(!formData.name ? "name" : !formData.email ? "email" : "message");
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast.error("Please enter a valid email address");
      focusInvalid("email");
      return;
    }

    if (!turnstileToken) {
      toast.error("Please complete the verification challenge and try again.");
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
          "x-amz-content-sha256": await sha256Hex(body),
        },
        body,
      });

      // The server always replies with JSON; tolerate an empty/garbled body.
      const data = await response.json().catch(() => ({}) as { error?: string });

      if (response.ok) {
        toast.success("Message sent — I typically reply within 24 hours.");
        setFormData({ name: "", email: "", role: "", message: "" });
        setCompanyWebsite("");
        return;
      }

      switch (response.status) {
        case 400:
          toast.error(
            data.error ||
              "Some details look off. Please check the form and try again.",
          );
          break;
        case 403:
          toast.error(
            data.error ||
              "Verification failed. Please complete the challenge and try again.",
          );
          break;
        case 429:
          toast.error(
            data.error ||
              "Too many requests. Please wait a moment, or email me directly.",
          );
          break;
        default:
          toast.error(
            data.error ||
              "Failed to send message. Please try again or email me directly.",
          );
      }
    } catch (error) {
      console.error("Form submission error:", error);
      toast.error(
        "Failed to send message. Please try again or email me directly.",
      );
    } finally {
      // The Turnstile token is single-use; always clear + reset the widget so a
      // retry starts from a fresh challenge.
      resetTurnstile();
      setIsSubmitting(false);
    }
  };

  return (
    <section id="contact" className={`${SECTION_PADDING} bg-background`}>
      <div className="container px-6">
        <div className="max-w-5xl mx-auto">
          {/* Section header */}
          <div className={`text-center max-w-3xl mx-auto ${SECTION_HEADER_MARGIN} animate-fade-in-up`}>
            <h2 className="text-fluid-3xl font-bold mb-6">What's the Hardest Part of the Job Right Now?</h2>
            <p className="text-fluid-lg text-muted-foreground">
              Tell me in a few lines — a stalled team, a rough transition, a decision you keep circling. That's exactly what a first conversation is for.
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
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    autoComplete="name"
                    value={formData.name}
                    onChange={(e) => {
                      setInvalidField(null);
                      setFormData({ ...formData, name: e.target.value });
                    }}
                    placeholder="Your full name"
                    required
                    aria-invalid={invalidField === "name"}
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="email">Email *</Label>
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
                  <Label htmlFor="role">Current Role</Label>
                  <Input
                    id="role"
                    name="role"
                    autoComplete="organization-title"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    placeholder="e.g., Engineering Manager, VP of Engineering"
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="message">What would you like help with? *</Label>
                  <Textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => {
                      setInvalidField(null);
                      setFormData({ ...formData, message: e.target.value });
                    }}
                    placeholder="Tell me about your current challenges or goals..."
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
                      Verification isn't available right now — please email me
                      directly at info@agusgonzaleznic.com.
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
                  {isSubmitting ? "Sending..." : "Send Message"}
                  <Send className="ml-2 h-5 w-5" />
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  By submitting, you agree to being contacted about coaching services. Your information is kept confidential.
                </p>
              </form>
            </Card>

            {/* Contact info */}
            <div className="lg:col-span-2 space-y-6 animate-fade-in-up delay-200">
              <Card className="p-6 border-2">
                <h3 className="font-bold mb-4">Get in Touch</h3>
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
                    <span className="text-sm">LinkedIn Profile</span>
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
                    <span className="text-sm">GitHub Profile</span>
                  </a>
                </div>
              </Card>

              <Card className="p-6 bg-accent/5 border-accent/20">
                <h3 className="font-bold mb-3 text-foreground">Response Time</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  I typically respond within 24 hours. For urgent inquiries, please mention it in your message.
                </p>
              </Card>

              <Card className="p-6 bg-primary/5 border-primary/20">
                <h3 className="font-bold mb-3 text-foreground">Free Discovery Call</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The first 30 minutes are on me: a working session on your situation, not a sales pitch. If I'm not the right coach for the problem, I'll say so.
                </p>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

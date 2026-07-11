import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getConsent,
  isAnalyticsConfigured,
  loadAnalytics,
  setConsent,
} from "@/lib/analytics";
import {
  getStickyCtaVisible,
  subscribeStickyCtaVisible,
} from "@/lib/layout";

// Two-mode privacy banner, driven by whether GA4 is configured (via the
// public VITE_GA_MEASUREMENT_ID build variable):
//
// - Not configured (default): purely informational — the site sets no cookies
//   and does no tracking, so there is nothing to consent to. One "Got it".
// - Configured: a real consent banner for optional analytics.
//   Accept and Decline carry equal visual weight (no dark patterns — GDPR
//   requires declining to be as easy as accepting). gtag.js is only injected
//   after an explicit Accept (see src/lib/analytics.ts).
//
// The decision is remembered in localStorage — which is NOT a cookie and never
// leaves the browser. If storage is blocked (private mode), the choice is
// honored in memory for the current session only (see src/lib/analytics.ts)
// and the banner re-asks on the next visit. The
// site is prerendered, so we render nothing on the server and reveal after
// mount to avoid a hydration mismatch (and to keep the static HTML free of
// the banner).
const DISMISS_KEY = "privacy-notice-dismissed";

export const CookieNotice = () => {
  const consentMode = isAnalyticsConfigured();
  const [visible, setVisible] = useState(false);
  // Navigation publishes whether the mobile sticky "Book a Session" CTA is
  // rendered; the banner only clears it (bottom-24) when it actually exists.
  const stickyCtaVisible = useSyncExternalStore(
    subscribeStickyCtaVisible,
    getStickyCtaVisible,
    () => false,
  );

  useEffect(() => {
    if (consentMode) {
      const consent = getConsent();
      if (consent === null) setVisible(true);
      // Returning visitor who already granted consent: load analytics now.
      if (consent === "granted") loadAnalytics();
      return;
    }
    try {
      if (localStorage.getItem(DISMISS_KEY) !== "true") setVisible(true);
    } catch {
      // Storage blocked (private mode / disabled) — still show the notice.
      setVisible(true);
    }
  }, [consentMode]);

  const dismissInfo = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "true");
    } catch {
      // Storage blocked — dismiss for this session only.
    }
    setVisible(false);
  };

  const accept = () => {
    setConsent("granted");
    loadAnalytics();
    setVisible(false);
  };

  const decline = () => {
    setConsent("denied");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Privacy notice"
      // bottom-24 on mobile clears the sticky "Book a Session" CTA (fixed
      // bottom-0, z-40 in Navigation) — but only while that CTA is rendered;
      // otherwise the banner sits at the viewport bottom. z-50 stays above it.
      className={`fixed inset-x-0 ${stickyCtaVisible ? "bottom-24" : "bottom-4"} md:bottom-6 z-50 px-4 md:px-6 animate-fade-in-up`}
    >
      <div className="container mx-auto max-w-3xl">
        <div className="flex flex-col gap-3 rounded-xl border-2 border-border bg-card/95 p-4 shadow-lg backdrop-blur-md sm:flex-row sm:items-center sm:gap-4">
          {consentMode ? (
            <>
              <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
                This site would like to use{" "}
                <span className="font-medium text-foreground">
                  optional analytics cookies
                </span>{" "}
                (Google Analytics) to understand how it is used. Nothing is
                loaded unless you accept — details are in the{" "}
                <a
                  href="/privacy"
                  className="font-medium text-accent hover:underline"
                >
                  Privacy Policy
                </a>
                .
              </p>
              {/* Accept and Decline share one style: GDPR consent must be as
                  easy to refuse as to give, so neither button is emphasized. */}
              <div className="flex shrink-0 gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={decline}
                  className="rounded-lg border-2 border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  Decline
                </button>
                <button
                  type="button"
                  onClick={accept}
                  className="rounded-lg border-2 border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  Accept
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
                This site uses{" "}
                <span className="font-medium text-foreground">
                  no cookies and no tracking
                </span>
                . Details are in the{" "}
                <a
                  href="/privacy"
                  className="font-medium text-accent hover:underline"
                >
                  Privacy Policy
                </a>
                .
              </p>
              <button
                type="button"
                onClick={dismissInfo}
                className="shrink-0 self-end rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover sm:self-auto"
              >
                Got it
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

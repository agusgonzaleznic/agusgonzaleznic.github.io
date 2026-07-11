// Google Analytics 4, gated behind explicit opt-in consent (GDPR Art. 6(1)(a)).
//
// The measurement ID is a PUBLIC value (it appears in every request the tag
// makes), so inlining it via VITE_ is fine. When the env var is unset the
// whole feature is off and this module does nothing.
//
// Privacy contract: NOTHING is injected or requested until the visitor has
// explicitly granted consent — the gtag.js script tag must not exist in the
// DOM at all while consent is absent or denied. Consent Mode v2 signals are
// still defaulted to "denied" before the config call as defense in depth.

const MEASUREMENT_ID: string = import.meta.env.VITE_GA_MEASUREMENT_ID ?? "";

const CONSENT_KEY = "analytics-consent";

export type AnalyticsConsent = "granted" | "denied";

export const isAnalyticsConfigured = (): boolean => MEASUREMENT_ID !== "";

// In-memory fallback so an explicit choice made THIS session is honored even
// when localStorage is blocked (private mode): the decision can't persist, but
// an Accept click must not be a silent no-op. Resets on the next page load, so
// the banner re-asks next visit.
let sessionConsent: AnalyticsConsent | null = null;

// null = no decision (neither stored nor made this session) — callers must
// treat that as denied.
export const getConsent = (): AnalyticsConsent | null => {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : sessionConsent;
  } catch {
    return sessionConsent;
  }
};

export const setConsent = (value: AnalyticsConsent | null): void => {
  sessionConsent = value;
  try {
    if (value === null) {
      localStorage.removeItem(CONSENT_KEY);
    } else {
      localStorage.setItem(CONSENT_KEY, value);
    }
  } catch {
    // Storage blocked — the decision lives only in sessionConsent above.
  }
};

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

type Gtag = (...args: unknown[]) => void;

let loaded = false;

// gtag.js only processes pushes of the live `arguments` object — pushing a
// plain array is silently ignored — so this must be a `function` using
// `arguments`, not a rest-parameter spread.
const gtag: Gtag = function () {
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer?.push(arguments);
};

// Injects gtag.js and configures GA4. Safe to call unconditionally (on mount
// and on Accept): it no-ops unless configured AND consent is "granted".
export const loadAnalytics = (): void => {
  if (loaded || !isAnalyticsConfigured() || getConsent() !== "granted") return;
  loaded = true;

  window.dataLayer = window.dataLayer ?? [];

  // Consent Mode v2: default every signal to denied, then grant only
  // analytics_storage — the visitor consented to analytics, nothing else.
  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
  });
  gtag("consent", "update", { analytics_storage: "granted" });

  gtag("js", new Date());
  // No anonymize_ip flag: that is a Universal Analytics parameter GA4
  // ignores — GA4 does not log or store IP addresses by default.
  gtag("config", MEASUREMENT_ID);

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
  document.head.appendChild(script);
};

// Withdraws consent (Art. 7(3) GDPR). Clearing the stored decision alone is
// not enough on a SPA: a previously consented visitor already has gtag.js
// running, and it would keep sending hits (engagement pings, SPA page_views)
// until the next full page load — which may never come this visit. So when
// the tag is loaded, also push a Consent Mode update, which halts analytics
// storage and hits immediately, and expire the GA cookies.
export const withdrawAnalyticsConsent = (): void => {
  setConsent(null);
  if (!loaded) return;

  gtag("consent", "update", { analytics_storage: "denied" });

  // GA sets _ga / _ga_* on the registrable parent domain; expire both there
  // and on the exact host to cover either scoping.
  const parentDomain = location.hostname.split(".").slice(-2).join(".");
  for (const cookie of document.cookie.split("; ")) {
    const name = cookie.split("=")[0];
    if (name !== "_ga" && !name.startsWith("_ga_")) continue;
    for (const domain of ["", `; domain=.${parentDomain}`]) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain}`;
    }
  }
};

// Cloudflare Turnstile client loader.
//
// api.js is loaded LAZILY (never at initial page load) so the site ships zero
// third-party JavaScript until a visitor actually reaches the contact form.
// Every entry point guards on `typeof window` so this module is import-safe
// during SSR / prerender (the widget only ever initialises in the browser).
//
// Explicit-render mode is used (`?render=explicit`): the script exposes
// `window.turnstile` on load and we drive `turnstile.render()` ourselves, which
// lets React own the container lifecycle instead of relying on auto-scanning.

const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

// Cloudflare injects this global once api.js finishes loading. Only the members
// this app uses are declared.
export interface TurnstileApi {
  render: (
    container: string | HTMLElement,
    options: {
      sitekey: string;
      action?: string;
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      "timeout-callback"?: () => void;
      theme?: "auto" | "light" | "dark";
      size?: "normal" | "flexible" | "compact";
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
  getResponse: (widgetId?: string) => string | undefined;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// Single in-flight/resolved load shared across every caller and re-render.
let loadPromise: Promise<TurnstileApi> | null = null;

/**
 * Inject api.js on demand and resolve with the `window.turnstile` API. Safe to
 * call repeatedly — the script is only ever added once. Rejects on SSR and on a
 * network/script failure (the rejection clears the cache so a later user action
 * can retry).
 */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("Turnstile is unavailable during SSR"));
  }
  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const onReady = () => {
      if (window.turnstile) {
        resolve(window.turnstile);
      } else {
        loadPromise = null;
        reject(new Error("Turnstile loaded but window.turnstile is missing"));
      }
    };
    const onError = () => {
      loadPromise = null; // allow a retry on a later trigger
      reject(new Error("Failed to load Turnstile"));
    };

    // Reuse a script tag if one was already injected (e.g. React StrictMode
    // double-invoke, or a remount).
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]',
    );
    if (existing) {
      existing.addEventListener("load", onReady, { once: true });
      existing.addEventListener("error", onError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", onReady, { once: true });
    script.addEventListener("error", onError, { once: true });
    document.head.appendChild(script);
  });

  return loadPromise;
}

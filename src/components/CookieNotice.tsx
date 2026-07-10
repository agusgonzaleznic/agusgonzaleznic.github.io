import { useEffect, useState } from "react";

// Privacy notice — deliberately NOT a cookie-consent banner. The site sets no
// cookies and does no tracking, so there is nothing to consent to; a "reject"
// button would gate nothing. This just informs the visitor (and points at the
// Privacy Policy for the one third-party flow: Google Fonts loading by IP).
//
// Dismissal is remembered in localStorage — which is NOT a cookie and never
// leaves the browser, so it doesn't reintroduce anything to disclose. The site
// is prerendered, so we render nothing on the server and reveal after mount to
// avoid a hydration mismatch (and to keep the static HTML free of the banner).
const STORAGE_KEY = "privacy-notice-dismissed";

export const CookieNotice = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== "true") setVisible(true);
    } catch {
      // Storage blocked (private mode / disabled) — still show the notice.
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // Storage blocked — dismiss for this session only.
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Privacy notice"
      // bottom-24 on mobile clears the sticky "Book a Session" CTA (fixed
      // bottom-0, z-40 in Navigation); z-50 keeps this above it.
      className="fixed inset-x-0 bottom-24 md:bottom-6 z-50 px-4 md:px-6 animate-fade-in-up"
    >
      <div className="container mx-auto max-w-3xl">
        <div className="flex flex-col gap-3 rounded-xl border-2 border-border bg-card/95 p-4 shadow-lg backdrop-blur-md sm:flex-row sm:items-center sm:gap-4">
          <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
            This site uses{" "}
            <span className="font-medium text-foreground">
              no cookies and no tracking
            </span>
            . Fonts are loaded from Google, which receives your IP address —
            details are in the{" "}
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
            onClick={dismiss}
            className="shrink-0 self-end rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover sm:self-auto"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

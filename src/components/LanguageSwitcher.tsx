import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLingui } from "@lingui/react/macro";
import { Check, ChevronDown, Globe } from "lucide-react";
import {
  delocalizePath,
  localeFromPath,
  localizePath,
  LOCALE_META,
  PUBLISHED_LOCALES,
} from "@/i18n/locales";
import { dynamicActivate } from "@/i18n/i18n";
import { cn } from "@/lib/utils";

// Crawlable language switcher: real <a> anchors to the SAME route in each
// PUBLISHED locale, so search/AI crawlers and no-JS visitors follow them to the
// prerendered per-locale page. SSR-safe — useLocation works under StaticRouter.
//
// PROGRESSIVE ENHANCEMENT: on a plain click we intercept, load the target
// locale's catalog, update <html lang>, and client-navigate — the text swaps
// in place with NO full reload, and ScrollManager keeps the reader's position
// (navigation state { localeSwitch }). Modifier/middle clicks, JS-off, and a
// failed catalog load all fall back to the anchor's normal full navigation, so
// nothing regresses. SEO is unchanged: the URL still becomes the real /{locale}/
// path (own canonical/hreflang), and crawlers use the prerendered pages.
//
// Renders ONLY published locales, and nothing until >=2 are published.
//
// variant="inline"   — flat row of codes (footer; ample room).
// variant="dropdown" — compact trigger + collapsible menu (top nav; saves space).
//   The menu's <a> anchors are ALWAYS in the DOM (only visually toggled), so the
//   prerendered HTML stays crawlable exactly like the inline list.
type Props = { className?: string; variant?: "inline" | "dropdown" };

export const LanguageSwitcher = ({ className, variant = "inline" }: Props) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside pointer / Escape — wired only while open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Intercept plain left-clicks for an in-place switch; let the browser handle
  // modifier/middle clicks (open in new tab) and fall back to a full navigation
  // if the catalog chunk fails to load.
  const switchTo = (e: MouseEvent<HTMLAnchorElement>, locale: string, href: string) => {
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    ) {
      return;
    }
    e.preventDefault();
    setOpen(false);
    dynamicActivate(locale)
      .then(() => {
        document.documentElement.lang = locale;
        navigate(href, { state: { localeSwitch: true } });
      })
      .catch(() => window.location.assign(href));
  };

  // Nothing to switch between until at least two locales are published.
  if (PUBLISHED_LOCALES.length < 2) return null;

  const current = localeFromPath(pathname);
  const basePath = delocalizePath(pathname);
  const links = PUBLISHED_LOCALES.map((locale) => ({
    locale,
    isActive: locale === current,
    href: localizePath(basePath, locale),
    name: LOCALE_META[locale].name,
  }));

  if (variant === "inline") {
    return (
      <nav aria-label={t`Language`} className={cn("flex items-center gap-3", className)}>
        {links.map(({ locale, isActive, href, name }) =>
          isActive ? (
            <span key={locale} aria-current="true" lang={locale} className="text-sm font-medium text-accent">
              {locale.toUpperCase()}
            </span>
          ) : (
            <a
              key={locale}
              href={href}
              lang={locale}
              hrefLang={locale}
              aria-label={name}
              onClick={(e) => switchTo(e, locale, href)}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-accent"
            >
              {locale.toUpperCase()}
            </a>
          ),
        )}
      </nav>
    );
  }

  // Dropdown variant.
  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t`Change language`}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-accent"
      >
        <Globe className="h-4 w-4" aria-hidden="true" />
        <span>{current.toUpperCase()}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {/* Anchors stay in the DOM at all times (crawlable); `hidden` only hides
          them visually when closed. */}
      <nav
        aria-label={t`Language`}
        className={cn(
          "absolute right-0 mt-2 min-w-[9rem] overflow-hidden rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-md",
          open ? "block" : "hidden",
        )}
      >
        {links.map(({ locale, isActive, href, name }) =>
          isActive ? (
            <span
              key={locale}
              aria-current="true"
              lang={locale}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm font-medium text-accent"
            >
              {name}
              <Check className="h-4 w-4" aria-hidden="true" />
            </span>
          ) : (
            <a
              key={locale}
              href={href}
              lang={locale}
              hrefLang={locale}
              onClick={(e) => switchTo(e, locale, href)}
              className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-accent"
            >
              {name}
            </a>
          ),
        )}
      </nav>
    </div>
  );
};

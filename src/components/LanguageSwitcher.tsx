import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Check, ChevronDown, Globe } from "lucide-react";
import {
  delocalizePath,
  localeFromPath,
  localizePath,
  LOCALE_META,
  PUBLISHED_LOCALES,
} from "@/i18n/locales";
import { cn } from "@/lib/utils";

// Crawlable language switcher: real <a> anchors to the SAME route in each
// PUBLISHED locale, so search/AI crawlers follow them and a switch triggers a
// full navigation (the destination locale's catalog + <html lang> load on
// load). SSR-safe — useLocation works under StaticRouter during prerender.
//
// It renders ONLY published locales. Today PUBLISHED_LOCALES === ["en"], so
// there is nothing to switch between and this renders nothing: mounting it is a
// no-op and the site is unchanged. When a second locale is published it appears
// automatically. The routing author mounts it in Navigation + Footer.
//
// variant="inline"   — flat row of codes (footer; ample room).
// variant="dropdown" — compact trigger + collapsible menu (top nav; saves space).
//   The menu's <a> anchors are ALWAYS in the DOM (only visually toggled), so the
//   prerendered HTML stays crawlable exactly like the inline list — the dropdown
//   is a display affordance, not a JS-gated content mount.
type Props = { className?: string; variant?: "inline" | "dropdown" };

export const LanguageSwitcher = ({ className, variant = "inline" }: Props) => {
  const { pathname } = useLocation();
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
      <nav aria-label="Language" className={cn("flex items-center gap-3", className)}>
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
        aria-label="Change language"
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
        aria-label="Language"
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

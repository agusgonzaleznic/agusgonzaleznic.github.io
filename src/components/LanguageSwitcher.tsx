import { useLocation } from "react-router-dom";
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
export const LanguageSwitcher = ({ className }: { className?: string }) => {
  const { pathname } = useLocation();

  // Nothing to switch between until at least two locales are published.
  if (PUBLISHED_LOCALES.length < 2) return null;

  const current = localeFromPath(pathname);
  const basePath = delocalizePath(pathname);

  return (
    <nav aria-label="Language" className={cn("flex items-center gap-3", className)}>
      {PUBLISHED_LOCALES.map((locale) => {
        const isActive = locale === current;
        const label = locale.toUpperCase();
        return isActive ? (
          <span
            key={locale}
            aria-current="true"
            lang={locale}
            className="text-sm font-medium text-accent"
          >
            {label}
          </span>
        ) : (
          <a
            key={locale}
            href={localizePath(basePath, locale)}
            lang={locale}
            hrefLang={locale}
            aria-label={LOCALE_META[locale].name}
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-accent"
          >
            {label}
          </a>
        );
      })}
    </nav>
  );
};

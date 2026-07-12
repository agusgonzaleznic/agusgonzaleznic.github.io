import { useLocation } from "react-router-dom";
import { localeFromPath, localizePath } from "@/i18n/locales";

// Keeps in-app navigation inside the visitor's current language. The site derives
// the active locale from the URL prefix and mounts the same pages under
// /{locale}; a hardcoded to="/blog/" would send a visitor on /de/... back to the
// English route, dropping their language. localizePath re-adds the active prefix
// (no-op for the English source locale). Used by <LocaleLink> and by imperative
// navigate() calls (section-scroll links).

/** Prefix an app-absolute path with the active locale (read from the URL). */
export function useLocalizedTo() {
  const { pathname } = useLocation();
  const locale = localeFromPath(pathname);
  return (to: string) => localizePath(to, locale);
}

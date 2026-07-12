// Single source of truth for the site's locales.
//
// SEO/GEO model (fixed): English is the DEFAULT/SOURCE locale and lives at the
// ROOT (`/`, `/blog/`, …) — it is the hreflang x-default and keeps the existing
// URLs + authority. Every other locale is served under a path prefix
// (`/de/`, `/es/blog/`, …).
//
// A locale is only PUBLISHED once its translated catalog exists AND has been
// reviewed. prerender, sitemap, hreflang, and the language switcher all iterate
// PUBLISHED_LOCALES, so today (en-only) nothing new is emitted: zero new URLs,
// zero behaviour change. Publishing a locale later = add it to PUBLISHED_LOCALES.

export const SOURCE_LOCALE = "en" as const;

/** Every locale we extract catalogs for (translators can start on all of them). */
export const ALL_LOCALES = ["en", "de", "es", "fr", "it", "pt"] as const;

export type Locale = (typeof ALL_LOCALES)[number];

/**
 * Display metadata. `name` is the language's endonym (used by the language
 * switcher). `dir` is the writing direction — all six are LTR today.
 * `ogLocale` is the Open Graph locale code (og:locale) for each language, used
 * when localizing a prefixed page's head.
 */
export const LOCALE_META: Record<Locale, { name: string; dir: "ltr" | "rtl"; ogLocale: string }> = {
  en: { name: "English", dir: "ltr", ogLocale: "en_US" },
  de: { name: "Deutsch", dir: "ltr", ogLocale: "de_DE" },
  es: { name: "Español", dir: "ltr", ogLocale: "es_ES" },
  fr: { name: "Français", dir: "ltr", ogLocale: "fr_FR" },
  it: { name: "Italiano", dir: "ltr", ogLocale: "it_IT" },
  pt: { name: "Português", dir: "ltr", ogLocale: "pt_PT" },
};

/**
 * Locales that actually render / are linked today. Keep this to `["en"]` until a
 * translated catalog is reviewed — this is the one switch that gates URLs,
 * sitemap entries, hreflang, and the language switcher.
 */
export const PUBLISHED_LOCALES: readonly Locale[] = ["en"];

/** Non-source locales, used to build and match path prefixes. */
const PREFIXED_LOCALES = ALL_LOCALES.filter((l) => l !== SOURCE_LOCALE);
// e.g. /^\/(de|es|fr|it|pt)(?=\/|$)/
const LOCALE_PREFIX_RE = new RegExp(`^/(${PREFIXED_LOCALES.join("|")})(?=/|$)`);

/** Is `l` a locale we currently publish (render + link)? */
export const isPublished = (l: string): l is Locale =>
  (PUBLISHED_LOCALES as readonly string[]).includes(l);

/** Is `l` one of the known locales at all (published or not)? */
export const isLocale = (l: string): l is Locale =>
  (ALL_LOCALES as readonly string[]).includes(l);

/**
 * Map an English (root) path to its equivalent in `locale`.
 * English is unchanged (`/blog/` -> `/blog/`); others are prefixed
 * (`/blog/` -> `/de/blog/`, `/` -> `/de/`).
 */
export function localizePath(path: string, locale: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (locale === SOURCE_LOCALE) return p;
  return `/${locale}${p}`;
}

/**
 * Strip a leading locale prefix, returning the English (root) equivalent path.
 * `/de/blog/` -> `/blog/`, `/de` -> `/`, `/blog/` -> `/blog/`.
 */
export function delocalizePath(path: string): string {
  const stripped = path.replace(LOCALE_PREFIX_RE, "");
  return stripped === "" ? "/" : stripped;
}

/** The locale implied by a path's prefix, or the source locale if none. */
export function localeFromPath(path: string): Locale {
  const match = path.match(LOCALE_PREFIX_RE);
  return match ? (match[1] as Locale) : SOURCE_LOCALE;
}

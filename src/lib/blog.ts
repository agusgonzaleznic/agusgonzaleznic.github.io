// Typed loader around the build-time Storyblok fetch output.
// src/generated/blog-data.json is written by scripts/fetch-blog.mjs (a plain
// JSON array of posts). The file is gitignored and only exists after
// `npm run fetch-blog` runs (`dev` and `build` run it automatically; bare
// `build:dev`/`build:client` on a fresh clone will fail on this import until
// it has run once). Everything here is pure and SSR-safe.
import blogIndex from "@/generated/blog-index.json";
import { SOURCE_LOCALE } from "@/i18n/locales";

// Re-exported for existing blog-side consumers; the canonical definition is
// in ./site so non-blog modules can import it without pulling this file's
// eager blog-data glob into their chunk.
export { SITE_URL } from "./site";
import { SITE_URL } from "./site";

// Types and the data-free helpers live in ./richtext so a component needing an
// image transform does not inherit this file's six-locale glob. Re-exported here
// because blog-side callers already import them from "@/lib/blog".
export type { RichtextMark, RichtextNode, BlogImage } from "./richtext";
export { extractText, readingTime, storyblokImage } from "./richtext";
import type { RichtextNode, BlogImage } from "./richtext";

export interface BlogPost {
  slug: string;
  full_slug?: string;
  title: string;
  excerpt: string;
  // NOTE: no `body`. It lives in blog-body.<locale>.json and is read through
  // src/lib/blog-body.ts on the article route only — see postCorpusLocale below.
  // Keeping a null-valued field here would let a caller read post.body and get
  // silence instead of a type error.
  cover_image: BlogImage | null;
  /** Storyblok datetime "YYYY-MM-DD HH:mm", UTC */
  published_date: string | null;
  first_published_at?: string | null;
  published_at?: string | null;
  original_url: string;
  seo_title: string;
  seo_description: string;
  canonical_override: string;
  tag_list: string[];
  uuid?: string;
  /**
   * Locales this article is actually EMITTED in, baked by fetch-blog.mjs from
   * scripts/lib/blog-gate.mjs. Absent/empty means "no restriction recorded" —
   * see getAllPosts.
   */
  approved_locales?: string[];
  /** Baked by fetch-blog so the index route never needs the article bodies. */
  reading_minutes?: number;
}

const rawPosts = (Array.isArray(blogIndex) ? blogIndex : []) as Partial<BlogPost>[];

// Per-locale blog data (src/generated/blog-data.<locale>.json) is written by the
// build-time DeepL pipeline (scripts/fetch-blog.mjs + richtext-translate.mjs)
// with the EXACT same shape as blog-data.json. Vite bundles whatever files exist
// at build time; with no DEEPL key none are emitted and this map is empty, so
// every locale falls back to the English source below. English never uses it.
const localeBlogData = import.meta.glob<Partial<BlogPost>[]>("../generated/blog-index.*.json", {
  eager: true,
  import: "default",
});

/** The raw post array for a locale, falling back to the English source. */
function rawFor(locale: string): Partial<BlogPost>[] {
  if (locale !== SOURCE_LOCALE) {
    const data = localeBlogData[`../generated/blog-index.${locale}.json`];
    if (Array.isArray(data)) return data;
  }
  return rawPosts;
}

const normalize = (p: Partial<BlogPost>): BlogPost => ({
  slug: p.slug ?? "",
  full_slug: p.full_slug ?? "",
  title: p.title ?? "",
  excerpt: p.excerpt ?? "",
  cover_image: p.cover_image?.filename ? p.cover_image : null,
  published_date: p.published_date ?? null,
  first_published_at: p.first_published_at ?? null,
  published_at: p.published_at ?? null,
  original_url: p.original_url ?? "",
  seo_title: p.seo_title ?? "",
  seo_description: p.seo_description ?? "",
  canonical_override: p.canonical_override ?? "",
  tag_list: Array.isArray(p.tag_list) ? p.tag_list : [],
  approved_locales: Array.isArray(p.approved_locales) ? p.approved_locales : [],
  // Baked at build time. Defaulted here rather than only on the interface,
  // because every consumer receives normalize()d objects — a field added to the
  // type alone would be undefined at runtime for all of them.
  reading_minutes: Math.max(1, p.reading_minutes ?? 1),
  uuid: p.uuid ?? "",
});

/** Best available publish date for a post, as the raw source string. */
export function postDate(post: BlogPost): string {
  return post.published_date || post.first_published_at || post.published_at || "";
}

/**
 * "YYYY-MM-DD HH:mm[:ss]" or ISO input → "YYYY-MM-DDTHH:mm:ss+00:00".
 * Storyblok datetimes are UTC; string surgery (not Date) keeps prerender and
 * client output identical regardless of the machine's timezone.
 */
export function toIsoUtc(date: string | null | undefined): string {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(?::(\d{2}))?)?/.exec(date ?? "");
  if (!m) return "";
  return `${m[1]}T${m[2] ?? "00:00"}:${m[3] ?? "00"}+00:00`;
}

// Per-locale long month names + date order. Deterministic string surgery (no
// Intl) so prerender (Node) and client (browser) always produce byte-identical
// output — hydration-safe and timezone-independent, unlike Intl.DateTimeFormat
// whose result can vary with the runtime's ICU version.
const MONTHS: Record<string, string[]> = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  de: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
  es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  fr: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
  it: ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"],
  pt: ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"],
};

/** Locale date order: en "July 4, 2026" · de "4. Juli 2026" · es/pt "4 de julio de 2026" · fr/it "4 juillet 2026". */
function formatByLocale(locale: string, month: string, day: number, year: string): string {
  switch (locale) {
    case "de": return `${day}. ${month} ${year}`;
    case "es":
    case "pt": return `${day} de ${month} de ${year}`;
    case "fr":
    case "it": return `${day} ${month} ${year}`;
    default: return `${month} ${day}, ${year}`; // en
  }
}

/** "2026-07-04 10:00" → localized date (timezone-independent, hydration-safe). */
export function formatDate(date: string | null | undefined, locale: string = SOURCE_LOCALE): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? "");
  if (!m) return "";
  const months = MONTHS[locale] ?? MONTHS[SOURCE_LOCALE];
  return formatByLocale(locale, months[Number(m[2]) - 1], Number(m[3]), m[1]);
}

/**
 * Is this article published in `locale`?
 *
 * An EMPTY/absent `approved_locales` means no restriction was recorded, and it
 * must NOT hide the post — that mirrors prerender.mjs, whose emission loop is
 * `if (route.approvedLocales && !route.approvedLocales.includes(locale))`. The
 * two consumers agreeing matters more than either policy on its own: if they
 * disagreed, one would emit a page the other refuses to link, or link a page
 * the other never emits. Failing open also means a regression in fetch-blog
 * cannot blank the entire blog.
 */
const emittedIn = (p: BlogPost, locale: string) =>
  !p.approved_locales?.length || p.approved_locales.includes(locale);

export function getAllPosts(locale: string = SOURCE_LOCALE): BlogPost[] {
  return rawFor(locale)
    .map(normalize)
    .filter((p) => p.slug && p.title)
    // Only articles that actually have a page in this locale. Without this the
    // locale index listed the English fallback for every article — rawFor()
    // falls back to blog-data.json when blog-data.<locale>.json is absent — so
    // holding a locale (AUTO_LOCALE_MODE="hold", or a withdrawn DE/ES approval)
    // left /{locale}/blog advertising PostCards that linked to pages prerender
    // had deliberately not emitted. Every one of those links was a 404.
    .filter((p) => emittedIn(p, locale))
    .sort((a, b) => toIsoUtc(postDate(b)).localeCompare(toIsoUtc(postDate(a))));
}

/**
 * Which corpus supplied getPost(slug, locale)'s result.
 *
 * The body now lives in a separate file per locale, so the body lookup has to
 * resolve to the SAME corpus the post came from — otherwise the deliberate
 * English fallback below (a locale with no approved variant still shows the
 * English article rather than a blank) would render an article with no text.
 * This mirrors rawFor() + getPost() exactly rather than re-deriving the rule.
 */
export function postCorpusLocale(slug: string, locale: string = SOURCE_LOCALE): string {
  if (locale === SOURCE_LOCALE) return SOURCE_LOCALE;
  const clean = slug.replace(/\/+$/, "");
  const foundInLocale = getAllPosts(locale).some((p) => p.slug === clean);
  if (!foundInLocale) return SOURCE_LOCALE;
  // rawFor() falls back to the English array when the locale file is absent, so
  // "found in locale" does not by itself mean the LOCALE corpus supplied it.
  return Array.isArray(localeBlogData[`../generated/blog-index.${locale}.json`])
    ? locale
    : SOURCE_LOCALE;
}

export function getPost(slug: string, locale: string = SOURCE_LOCALE): BlogPost | undefined {
  const clean = slug.replace(/\/+$/, "");
  const localized = getAllPosts(locale).find((p) => p.slug === clean);
  if (localized || locale === SOURCE_LOCALE) return localized;
  // Review gate: this article has no approved/available variant in `locale`
  // (e.g. a stray client-side link to a not-yet-reviewed translation). Fall back
  // to the English post so the reader gets content, not a blank not-found.
  return getAllPosts(SOURCE_LOCALE).find((p) => p.slug === clean);
}




/** Canonical URL for a post: trailing slash to match what GitHub Pages serves. */
export function postUrl(slug: string): string {
  return `${SITE_URL}/blog/${slug}/`;
}

// Typed loader around the build-time Storyblok fetch output.
// src/generated/blog-data.json is written by scripts/fetch-blog.mjs (a plain
// JSON array of posts). The file is gitignored and only exists after
// `npm run fetch-blog` runs (`dev` and `build` run it automatically; bare
// `build:dev`/`build:client` on a fresh clone will fail on this import until
// it has run once). Everything here is pure and SSR-safe.
import blogData from "@/generated/blog-data.json";
import { SOURCE_LOCALE } from "@/i18n/locales";

export const SITE_URL = "https://agusgonzaleznic.com";

export interface RichtextMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface RichtextNode {
  type?: string;
  text?: string;
  content?: RichtextNode[];
  marks?: RichtextMark[];
  attrs?: Record<string, unknown>;
}

export interface BlogImage {
  filename: string;
  alt?: string | null;
  title?: string | null;
}

export interface BlogPost {
  slug: string;
  full_slug?: string;
  title: string;
  excerpt: string;
  body: RichtextNode | null;
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
}

const rawPosts = (Array.isArray(blogData) ? blogData : []) as Partial<BlogPost>[];

// Per-locale blog data (src/generated/blog-data.<locale>.json) is written by the
// build-time DeepL pipeline (scripts/fetch-blog.mjs + richtext-translate.mjs)
// with the EXACT same shape as blog-data.json. Vite bundles whatever files exist
// at build time; with no DEEPL key none are emitted and this map is empty, so
// every locale falls back to the English source below. English never uses it.
const localeBlogData = import.meta.glob<Partial<BlogPost>[]>("../generated/blog-data.*.json", {
  eager: true,
  import: "default",
});

/** The raw post array for a locale, falling back to the English source. */
function rawFor(locale: string): Partial<BlogPost>[] {
  if (locale !== SOURCE_LOCALE) {
    const data = localeBlogData[`../generated/blog-data.${locale}.json`];
    if (Array.isArray(data)) return data;
  }
  return rawPosts;
}

const normalize = (p: Partial<BlogPost>): BlogPost => ({
  slug: p.slug ?? "",
  full_slug: p.full_slug ?? "",
  title: p.title ?? "",
  excerpt: p.excerpt ?? "",
  body: p.body ?? null,
  cover_image: p.cover_image?.filename ? p.cover_image : null,
  published_date: p.published_date ?? null,
  first_published_at: p.first_published_at ?? null,
  published_at: p.published_at ?? null,
  original_url: p.original_url ?? "",
  seo_title: p.seo_title ?? "",
  seo_description: p.seo_description ?? "",
  canonical_override: p.canonical_override ?? "",
  tag_list: Array.isArray(p.tag_list) ? p.tag_list : [],
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

export function getAllPosts(locale: string = SOURCE_LOCALE): BlogPost[] {
  return rawFor(locale)
    .map(normalize)
    .filter((p) => p.slug && p.title)
    .sort((a, b) => toIsoUtc(postDate(b)).localeCompare(toIsoUtc(postDate(a))));
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

/** Concatenated plain text of a richtext subtree. */
export function extractText(node: RichtextNode | null | undefined): string {
  if (!node) return "";
  if (node.text) return node.text;
  if (!node.content?.length) return "";
  return node.content.map(extractText).join(" ");
}

/** Estimated reading time in whole minutes (200 wpm, min 1). */
export function readingTime(body: RichtextNode | null): number {
  const words = extractText(body).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/**
 * Storyblok image service transform: appending /m/ resizes and auto-serves
 * WebP/AVIF. height 0 = proportional; a fixed height adds smart cropping.
 */
export function storyblokImage(filename: string, width: number, height = 0): string {
  if (!/\/\/a\.storyblok\.com\//.test(filename)) return filename;
  const crop = height > 0 ? "/smart" : "";
  return `${filename}/m/${width}x${height}${crop}/filters:quality(80)`;
}

/** Canonical URL for a post: trailing slash to match what GitHub Pages serves. */
export function postUrl(slug: string): string {
  return `${SITE_URL}/blog/${slug}/`;
}

// Typed loader around the build-time Storyblok PAGE fetch output — the marketing
// analog of src/lib/blog.ts. src/generated/page-data.json is written by
// scripts/fetch-pages.mjs (a plain JSON array of pages); per-locale
// page-data.<locale>.json are written by the build-time translation step. Both
// are gitignored and only exist after `npm run fetch-pages` (run automatically
// by `dev` and `build`). Everything here is pure and SSR-safe (no fetch, no
// Date/Intl) so prerender (Node) and hydration (browser) render identically.
//
// SAFETY: when a page/locale is absent (e.g. tokenless PR CI, or a page not yet
// authored in the CMS) getPageContent returns null and the calling component
// falls back to its hardcoded copy — so the live design can never break.
import pageData from "@/generated/page-data.json";
import { SOURCE_LOCALE } from "@/i18n/locales";

/** One block inside a page's body (component name + its Storyblok fields). */
export interface PageBlock {
  component: string;
  [key: string]: unknown;
}

/** A marketing page's baked content (English source or a translated locale). */
export interface PageContent {
  slug: string;
  seo_title: string;
  seo_description: string;
  /** Optional per-page social image URL; "" → the shared site banner. */
  og_image: string;
  blocks: PageBlock[];
}

const rawPages = (Array.isArray(pageData) ? pageData : []) as Partial<PageContent>[];

// Per-locale page data (src/generated/page-data.<locale>.json), same shape as
// page-data.json. Vite bundles whatever files exist at build time; with none
// present this map is empty and every locale falls back to the English source.
const localePageData = import.meta.glob<Partial<PageContent>[]>("../generated/page-data.*.json", {
  eager: true,
  import: "default",
});

function rawFor(locale: string): Partial<PageContent>[] {
  if (locale !== SOURCE_LOCALE) {
    const data = localePageData[`../generated/page-data.${locale}.json`];
    if (Array.isArray(data)) return data;
  }
  return rawPages;
}

function find(list: Partial<PageContent>[], slug: string): PageContent | null {
  const p = list.find((x) => x.slug === slug);
  if (!p || !Array.isArray(p.blocks)) return null;
  return {
    slug: p.slug ?? slug,
    seo_title: p.seo_title ?? "",
    seo_description: p.seo_description ?? "",
    og_image: p.og_image ?? "",
    blocks: p.blocks as PageBlock[],
  };
}

/**
 * The CMS content for a marketing page in `locale`, or null when it isn't
 * available (→ the component renders its hardcoded fallback). Falls back to the
 * English page before null, so a not-yet-translated locale still gets content.
 */
export function getPageContent(slug: string, locale: string = SOURCE_LOCALE): PageContent | null {
  return find(rawFor(locale), slug) ?? (locale !== SOURCE_LOCALE ? find(rawPages, slug) : null);
}

/** First block of a given component type in a page, typed by the caller. */
export function getBlock<T extends PageBlock = PageBlock>(
  content: PageContent | null,
  component: string,
): T | undefined {
  return content?.blocks.find((b) => b.component === component) as T | undefined;
}

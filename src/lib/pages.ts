// Typed loader around the build-time Storyblok PAGE fetch output, the marketing
// analog of src/lib/blog.ts. src/generated/page-data.json is written by
// scripts/fetch-pages.mjs (a plain JSON array of pages); per-locale
// page-data.<locale>.json are written by the build-time translation step. Both
// are gitignored and only exist after `npm run fetch-pages` (run automatically
// by `dev` and `build`). Everything here is pure and SSR-safe (no fetch, no
// Date/Intl) so prerender (Node) and hydration (browser) render identically.
//
// SAFETY: when a page/locale is absent (e.g. tokenless PR CI, or a page not yet
// authored in the CMS) getPageContent returns null and the calling component
// falls back to its hardcoded copy, so the live design can never break.
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
// page-data.json, registered rather than eagerly imported.
//
// WHY NOT AN EAGER GLOB. It used to be `import.meta.glob(..., { eager: true })`,
// and because this module is reachable from the eager Index route, all six
// locales' JSON landed in the ENTRY chunk that all 85 prerendered pages load:
// 108,186 of its 271,128 characters, about 25 kB of its gzip. A visitor on /es/
// downloaded and parsed the German, French, Italian, Portuguese and English
// marketing copy on the render-blocking path to read none of it, since the locale
// is fixed by the URL prefix and rawFor() can only ever return one of them.
//
// getPageContent must stay SYNCHRONOUS: it is called inside render on both sides
// (Index.tsx, and renderToString on the server). So loading stays out of here.
// The client awaits loadLocalePages() in main.tsx alongside the Lingui catalog it
// already awaits, so this costs no additional serial round trip; the server
// registers all locales eagerly in entry-server.tsx, where bundle size is
// irrelevant and rendering has to be sync.
const localePageData: Record<string, Partial<PageContent>[]> = {};

/** Register a locale's page array. Called by the client loader and by SSR. */
export function setLocalePages(locale: string, data: unknown): void {
  if (Array.isArray(data)) localePageData[locale] = data as Partial<PageContent>[];
}

/**
 * Load one locale's page data into the registry. Resolves either way: a missing
 * file is the documented tokenless case (no CMS token, so no locale output), and
 * the caller then falls back to the English source, exactly as before.
 */
export async function loadLocalePages(locale: string): Promise<void> {
  if (locale === SOURCE_LOCALE || localePageData[locale]) return;
  try {
    const mod = await import(`../generated/page-data.${locale}.json`);
    setLocalePages(locale, mod.default);
  } catch {
    // No data for this locale in this build; English is the fallback.
  }
}

function rawFor(locale: string): Partial<PageContent>[] {
  if (locale !== SOURCE_LOCALE) {
    const data = localePageData[locale];
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

/**
 * Prop accepted by every marketing page wrapper. In production it's never
 * passed (the wrapper reads baked content via getPageContent); the Storyblok
 * Visual Editor preview route (src/pages/StoryblokPage.tsx) passes the LIVE
 * draft so the preview renders the real page design with unsaved edits.
 */
export interface PagePreviewProps {
  previewContent?: PageContent;
}

/** First block of a given component type in a page, typed by the caller. */
export function getBlock<T extends PageBlock = PageBlock>(
  content: PageContent | null,
  component: string,
): T | undefined {
  return content?.blocks.find((b) => b.component === component) as T | undefined;
}

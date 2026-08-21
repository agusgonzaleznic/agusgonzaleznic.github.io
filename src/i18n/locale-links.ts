import { createContext, useContext } from "react";

// What the language switcher should link to on THIS page.
//
// The switcher is rendered by Navigation and Footer, so it only ever knew the
// current URL — it built "the same path in every published locale" and assumed
// that path exists everywhere. For most of the site that is true. Two routes
// break it:
//
//   Blog articles — a variant exists only in the locales the review gate
//   approved (scripts/lib/blog-gate.mjs). The <head> already limits its hreflang
//   alternates to those, but the switcher in the body kept offering all six, so
//   up to five of its links pointed at pages prerender had deliberately not
//   emitted. Every one was a 404, and they sat in the crawlable prerendered HTML
//   contradicting the hreflang set on the same page.
//
//   The 404 page — there is no "this page in German" for a URL that does not
//   exist. Localizing the unknown path just produces another 404. (This is only
//   visible after hydration: the prerendered copy carries the synthetic route
//   path, the live one carries whatever the visitor actually typed.)
//
// A page states its own reality here and the switcher obeys. Deliberately NOT
// derived inside the switcher from the route: the switcher would have to import
// the blog corpus to answer it, which is exactly the dependency that made a
// 64 KB chunk load on every marketing page.
//
// Exported as the raw context rather than a <Provider> wrapper component so this
// module ships no component at all — a file exporting both a component and a
// hook trips react-refresh/only-export-components, and splitting it in two for
// four lines of provider would be worse.

export type LocaleLinks = {
  /**
   * Locales in which the CURRENT page exists. Locales outside this set are still
   * offered — a reader must always be able to change the site language — but
   * they link to `fallbackPath` instead of this page.
   */
  locales?: string[];
  /** Where locales outside `locales` should point. Default: the site root. */
  fallbackPath?: string;
  /** Replace the path being localized entirely (the 404 case). */
  basePath?: string;
};

export const LocaleLinksContext = createContext<LocaleLinks>({});

export const useLocaleLinks = () => useContext(LocaleLinksContext);

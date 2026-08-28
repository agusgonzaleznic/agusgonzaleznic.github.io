import { renderToString } from "react-dom/server";
import { Helmet } from "react-helmet";
// react-router 7 folded the DOM and server entry points back into the
// react-router package; the react-router-dom/server subpath no longer exists.
// This is the only import in the tree that moved: everything else still imports
// from react-router-dom, which v7 keeps as a re-export.
import { StaticRouter } from "react-router";
import { AppProviders, AppRoutes, type RoutePages } from "./App";
import Index from "./pages/Index";
import About from "./pages/About";
import Philosophy from "./pages/Philosophy";
import Services from "./pages/Services";
import Impact from "./pages/Impact";
import Faq from "./pages/Faq";
import Contact from "./pages/Contact";
import Links from "./pages/Links";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import { Impressum, Privacy } from "./pages/Legal";
import { StoryblokPage } from "./pages/StoryblokPage";
import NotFound from "./pages/NotFound";
import { i18n } from "./i18n/i18n";
import { SOURCE_LOCALE } from "./i18n/locales";
import { setLocalePages } from "./lib/pages";

// Register every locale's marketing-page JSON up front. renderToString is
// synchronous, so the data has to be present before render() is called, and this
// is the SERVER bundle, where an eager glob costs nothing that ships to a reader.
// The client loads only the locale it is on (src/main.tsx). With no CMS token this
// map is empty and every locale falls back to the English source, unchanged.
const serverLocalePages = import.meta.glob<unknown>("./generated/page-data.*.json", {
  eager: true,
  import: "default",
});
for (const [path, data] of Object.entries(serverLocalePages)) {
  const locale = path.match(/page-data\.([a-z-]+)\.json$/)?.[1];
  if (locale) setLocalePages(locale, data);
}

// All-eager page map for the prerender: renderToString must emit each route's
// full markup synchronously, so NO lazy() here. The client uses code-split lazy
// chunks (App.tsx clientPages); the shared <Suspense> in AppRoutes makes the two
// trees' Suspense boundaries match so hydration keeps the prerendered markup.
const serverPages: RoutePages = {
  Index,
  About,
  Philosophy,
  Services,
  Impact,
  Faq,
  Contact,
  Links,
  Blog,
  BlogPost,
  Impressum,
  Privacy,
  StoryblokPage,
  NotFound,
};

// Server entry used by scripts/prerender.mjs to render routes to static HTML at
// build time. Mirrors the client tree (AppProviders + AppRoutes) so the markup
// hydrates cleanly; StaticRouter stands in for the client's BrowserRouter.
//
// The active Lingui locale is derived from the URL prefix and set BEFORE
// renderToString. English is preloaded + activated by ./i18n/i18n; for a
// prefixed locale the prerender loop `await dynamicActivate(locale)` first (it
// bundles/fetches that locale's catalog), then calls render with the same
// locale. The activate() here is the synchronous, defensive re-assertion so a
// single-arg render(path) call still behaves identically to English.
export function render(url: string, locale: string = SOURCE_LOCALE) {
  i18n.activate(locale);
  const html = renderToString(
    <StaticRouter location={url}>
      <AppProviders>
        <AppRoutes pages={serverPages} />
      </AppProviders>
    </StaticRouter>,
  );
  // react-helmet's module-level singleton MUST be drained via renderStatic()
  // after every renderToString; otherwise one route's head tags leak into the
  // next route's render (and it leaks memory). Safe here because the prerender
  // loop is sequential and single-process.
  const helmet = Helmet.renderStatic();
  return { html, helmet };
}

// Re-exported so the Node build scripts (scripts/prerender.mjs,
// scripts/generate-feeds.mjs) read the locale config from ONE source of
// truth (src/i18n, compiled into this bundle) instead of duplicating the
// list in .mjs.
export { dynamicActivate } from "./i18n/i18n";
export {
  PUBLISHED_LOCALES,
  SOURCE_LOCALE,
  localizePath,
  LOCALE_META,
} from "./i18n/locales";

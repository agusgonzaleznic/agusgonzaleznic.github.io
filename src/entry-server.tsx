import { renderToString } from "react-dom/server";
import { Helmet } from "react-helmet";
import { StaticRouter } from "react-router-dom/server";
import { AppProviders, AppRoutes, type RoutePages } from "./App";
import Index from "./pages/Index";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import { Impressum, Privacy } from "./pages/Legal";
import { StoryblokPage } from "./pages/StoryblokPage";
import NotFound from "./pages/NotFound";
import { i18n } from "./i18n/i18n";
import { SOURCE_LOCALE } from "./i18n/locales";

// All-eager page map for the prerender: renderToString must emit each route's
// full markup synchronously, so NO lazy() here. The client uses code-split lazy
// chunks (App.tsx clientPages); the shared <Suspense> in AppRoutes makes the two
// trees' Suspense boundaries match so hydration keeps the prerendered markup.
const serverPages: RoutePages = {
  Index,
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
// locale — the activate() here is the synchronous, defensive re-assertion so a
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
  // after every renderToString — otherwise one route's head tags leak into the
  // next route's render (and it leaks memory). Safe here because the prerender
  // loop is sequential and single-process.
  const helmet = Helmet.renderStatic();
  return { html, helmet };
}

// Re-exported so the Node build scripts (scripts/prerender.mjs,
// scripts/generate-feeds.mjs) read the locale config from ONE source of truth —
// src/i18n — compiled into this bundle, instead of duplicating the list in .mjs.
export { dynamicActivate } from "./i18n/i18n";
export {
  PUBLISHED_LOCALES,
  SOURCE_LOCALE,
  localizePath,
  LOCALE_META,
} from "./i18n/locales";

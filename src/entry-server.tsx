import { renderToString } from "react-dom/server";
import { Helmet } from "react-helmet";
import { StaticRouter } from "react-router-dom/server";
import { AppProviders, AppRoutes } from "./App";
import { i18n } from "./i18n/i18n";
import { SOURCE_LOCALE } from "./i18n/locales";

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
        <AppRoutes />
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

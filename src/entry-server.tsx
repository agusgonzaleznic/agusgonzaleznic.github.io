import { renderToString } from "react-dom/server";
import { Helmet } from "react-helmet";
import { StaticRouter } from "react-router-dom/server";
import { AppProviders, AppRoutes } from "./App";

// Server entry used by scripts/prerender.mjs to render routes to static HTML at
// build time. Mirrors the client tree (AppProviders + AppRoutes) so the markup
// hydrates cleanly; StaticRouter stands in for the client's BrowserRouter.
export function render(url: string) {
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

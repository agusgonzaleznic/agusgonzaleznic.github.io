import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { AppProviders, AppRoutes } from "./App";

// Server entry used by scripts/prerender.mjs to render routes to static HTML at
// build time. Mirrors the client tree (AppProviders + AppRoutes) so the markup
// hydrates cleanly; StaticRouter stands in for the client's BrowserRouter.
export function render(url: string) {
  return renderToString(
    <StaticRouter location={url}>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
    </StaticRouter>,
  );
}

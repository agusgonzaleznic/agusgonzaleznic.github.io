import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { localeFromPath } from "./i18n/locales";
import { dynamicActivate } from "./i18n/i18n";

// NOTE: initStoryblok() is deliberately NOT called here. The Storyblok SDK and
// its 15 registered block components are only needed by the /preview/* Visual
// Editor route, which lazily imports StoryblokPage, and that module initialises
// the SDK at its own module scope, before any of its hooks run. Initialising
// eagerly here put @storyblok/react plus every block component into the entry
// graph of all 85 prerendered pages for a code path the live site never takes
// (the preview also requires VITE_STORYBLOK_ACCESS_TOKEN, which is dev-only).

const rootEl = document.getElementById("root")!;

// Activate the locale implied by the URL prefix BEFORE mounting, so the client's
// active Lingui locale matches what the server prerendered and React hydrates
// cleanly. English is already loaded+activated by ./i18n/i18n (so this resolves
// without a fetch); a prefixed locale loads its code-split catalog chunk first.
async function bootstrap() {
  await dynamicActivate(localeFromPath(window.location.pathname));

  // The home page is prerendered to static HTML at build time, so #root already
  // contains server-rendered markup in production; hydrate it instead of
  // throwing it away. In dev (or any non-prerendered route) #root is empty, so
  // mount fresh.
  if (rootEl.hasChildNodes()) {
    hydrateRoot(rootEl, <App />);
  } else {
    createRoot(rootEl).render(<App />);
  }
}

void bootstrap();

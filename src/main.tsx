import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initStoryblok } from "./lib/storyblok";

// Initialize Storyblok SDK
// This sets up the Storyblok client with configuration from environment variables
// Must be called before rendering to enable CMS features
initStoryblok();

const rootEl = document.getElementById("root")!;

// The home page is prerendered to static HTML at build time, so #root already
// contains server-rendered markup in production — hydrate it instead of throwing
// it away. In dev (or any non-prerendered route) #root is empty, so mount fresh.
if (rootEl.hasChildNodes()) {
  hydrateRoot(rootEl, <App />);
} else {
  createRoot(rootEl).render(<App />);
}

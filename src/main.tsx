import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initStoryblok } from "./lib/storyblok";

// Initialize Storyblok SDK
// This sets up the Storyblok client with configuration from environment variables
// Must be called before rendering to enable CMS features
initStoryblok();

// Register COOP service worker (GitHub Pages cannot set HTTP headers)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/coop-sw.js");
}

createRoot(document.getElementById("root")!).render(<App />);

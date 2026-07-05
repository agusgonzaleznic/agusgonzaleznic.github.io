// Build-time prerender (SSG).
//
// Runs after `vite build` (client) and `vite build --ssr` (server). It imports
// the compiled server entry, renders each route to an HTML string, and injects
// that markup into the built dist/index.html so the served HTML contains the
// full page — readable by AI crawlers and search engines that don't run JS.
//
// Pure Node (no headless browser), so it's fast and CI-friendly.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync, brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { generateFeeds } from "./generate-feeds.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const distDir = resolve(projectRoot, "dist");
const serverEntry = resolve(projectRoot, "dist-server/entry-server.js");
const blogDataFile = resolve(projectRoot, "src/generated/blog-data.json");

// Routes to prerender. Storyblok preview routes are intentionally excluded —
// they fetch live CMS data at runtime and shouldn't be baked in.
const routes = [
  { path: "/", file: "index.html" },
  { path: "/impressum", file: "impressum/index.html" },
  { path: "/privacy", file: "privacy/index.html" },
];

// Blog routes come from the build-time Storyblok fetch (scripts/fetch-blog.mjs).
if (!existsSync(blogDataFile)) {
  throw new Error(
    "src/generated/blog-data.json not found — run `npm run fetch-blog` (part of `npm run build`) first.",
  );
}
const blogPosts = JSON.parse(readFileSync(blogDataFile, "utf-8"));
routes.push({ path: "/blog", file: "blog/index.html" });
for (const post of blogPosts) {
  routes.push({ path: `/blog/${post.slug}`, file: `blog/${post.slug}/index.html` });
}

const { render } = await import(pathToFileURL(serverEntry).href);
const template = readFileSync(resolve(distDir, "index.html"), "utf-8");

const ROOT = '<div id="root"></div>';
// Markers in index.html delimiting the route-specific head block (title, meta,
// canonical, JSON-LD). Between the markers sits the HOMEPAGE head, which is
// what dist/index.html must keep: it is served for "/" and as the SPA
// client-routing fallback shell.
const HEAD_START = "<!-- route-head:start -->";
const HEAD_END = "<!-- route-head:end -->";

// Replaces the template's homepage head block with the react-helmet output the
// route emitted during its render. Fails hard on a missing/empty <title> so a
// page without a <Helmet> can't silently ship the homepage head.
function injectRouteHead(html, route, helmet) {
  const start = html.indexOf(HEAD_START);
  const end = html.indexOf(HEAD_END);
  if (start === -1 || end === -1) {
    throw new Error(
      `Could not find "${HEAD_START}" / "${HEAD_END}" markers in dist/index.html — required to inject per-route head for ${route.path}.`,
    );
  }

  const titleText = helmet.title
    .toString()
    .replace(/<[^>]*>/g, "")
    .trim();
  if (!titleText) {
    throw new Error(
      `Route ${route.path} rendered an empty <title>. Its page component must set one via a react-helmet <Helmet> block — refusing to fall back to the homepage head.`,
    );
  }

  const headTags = [
    helmet.title.toString(),
    helmet.meta.toString(),
    helmet.link.toString(),
    helmet.script.toString(),
  ]
    .filter(Boolean)
    .join("\n    ");

  return html.slice(0, start) + headTags + html.slice(end + HEAD_END.length);
}

for (const route of routes) {
  const { html: appHtml, helmet } = render(route.path);

  // "/" keeps the template head untouched — the block between the markers IS
  // the homepage head. Every other route gets its own helmet-emitted head.
  let html = route.path === "/" ? template : injectRouteHead(template, route, helmet);

  if (!html.includes(ROOT)) {
    throw new Error(`Could not find "${ROOT}" in dist/index.html to inject prerendered markup.`);
  }

  html = html.replace(ROOT, `<div id="root">${appHtml}</div>`);
  const outFile = resolve(distDir, route.file);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, html);

  // The client build precompressed the pre-injection index.html, so refresh the
  // .gz/.br copies to match the prerendered output (vite-plugin-compression
  // config: gzip + brotli, threshold 1kb).
  const buf = Buffer.from(html);
  if (buf.length > 1024) {
    writeFileSync(`${outFile}.gz`, gzipSync(buf, { level: 9 }));
    writeFileSync(
      `${outFile}.br`,
      brotliCompressSync(buf, {
        params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
      }),
    );
  }

  console.log(`✓ Prerendered ${route.path} → dist/${route.file} (${appHtml.length} chars)`);
}

// Feeds go last so llms.txt/sitemap.xml overwrite the copies vite made from public/.
generateFeeds();

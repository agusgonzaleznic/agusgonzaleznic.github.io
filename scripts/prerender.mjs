// Build-time prerender (SSG).
//
// Runs after `vite build` (client) and `vite build --ssr` (server). It imports
// the compiled server entry, renders each route to an HTML string, and injects
// that markup into the built dist/index.html so the served HTML contains the
// full page — readable by AI crawlers and search engines that don't run JS.
//
// Pure Node (no headless browser), so it's fast and CI-friendly.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync, brotliCompressSync, constants as zlibConstants } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const distDir = resolve(projectRoot, "dist");
const serverEntry = resolve(projectRoot, "dist-server/entry-server.js");

// Routes to prerender. Storyblok preview routes are intentionally excluded —
// they fetch live CMS data at runtime and shouldn't be baked in.
const routes = [{ path: "/", file: "index.html" }];

const { render } = await import(pathToFileURL(serverEntry).href);
const template = readFileSync(resolve(distDir, "index.html"), "utf-8");

const ROOT = '<div id="root"></div>';

for (const route of routes) {
  const appHtml = render(route.path);

  if (!template.includes(ROOT)) {
    throw new Error(`Could not find "${ROOT}" in dist/index.html to inject prerendered markup.`);
  }

  const html = template.replace(ROOT, `<div id="root">${appHtml}</div>`);
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

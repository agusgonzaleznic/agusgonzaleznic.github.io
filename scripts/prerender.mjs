// Build-time prerender (SSG).
//
// Runs after `vite build` (client) and `vite build --ssr` (server). It imports
// the compiled server entry, renders each route to an HTML string, and injects
// that markup into the built dist/index.html so the served HTML contains the
// full page — readable by AI crawlers and search engines that don't run JS.
//
// i18n: the route list is the cross product of PUBLISHED_LOCALES × routes.
// English (the source locale) renders at the ROOT (dist/index.html, …); every
// other published locale renders under a /{locale}/ subdirectory. Per locale we
// inject an <html lang>, and a COMPLETE hreflang set (one alternate per
// published locale's equivalent URL + x-default → the English URL). Today
// PUBLISHED_LOCALES = ["en"], so only the root files are written (nothing under
// /de, /es, …) and the only head delta vs. the pre-i18n site is a self
// hreflang="en" + x-default — both harmless and pointing at the same URL.
//
// Pure Node (no headless browser), so it's fast and CI-friendly.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync, brotliCompressSync, constants as zlibConstants } from "node:zlib";
import Beasties from "beasties";
import { generateFeeds } from "./generate-feeds.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const distDir = resolve(projectRoot, "dist");
const serverEntry = resolve(projectRoot, "dist-server/entry-server.js");
const blogDataFile = resolve(projectRoot, "src/generated/blog-data.json");

const SITE_URL = "https://agusgonzaleznic.com";

// Routes to prerender. `canonical` is the canonical URL path (matching each
// page's <link rel="canonical">): the blog paths carry a trailing slash, the
// legal pages don't. hreflang alternates are built from it. Storyblok preview
// routes are intentionally excluded — they fetch live CMS data at runtime.
const routes = [
  { path: "/", file: "index.html", canonical: "/" },
  { path: "/impressum", file: "impressum/index.html", canonical: "/impressum" },
  { path: "/privacy", file: "privacy/index.html", canonical: "/privacy" },
];

// Blog routes come from the build-time Storyblok fetch (scripts/fetch-blog.mjs).
if (!existsSync(blogDataFile)) {
  throw new Error(
    "src/generated/blog-data.json not found — run `npm run fetch-blog` (part of `npm run build`) first.",
  );
}
const blogPosts = JSON.parse(readFileSync(blogDataFile, "utf-8"));
routes.push({ path: "/blog", file: "blog/index.html", canonical: "/blog/" });
for (const post of blogPosts) {
  routes.push({
    path: `/blog/${post.slug}`,
    file: `blog/${post.slug}/index.html`,
    canonical: `/blog/${post.slug}/`,
    // Review gate: emit this article's /{locale}/ variant + hreflang only for
    // its approved (or auto) locales. Fallback keeps old behaviour if the field
    // is ever absent (e.g. hand-built data). See scripts/lib/blog-gate.mjs.
    approvedLocales: post.approved_locales,
  });
}

// One source of truth: render + the locale config come from the compiled server
// bundle (src/i18n, compiled into dist-server/entry-server.js).
const { render, dynamicActivate, PUBLISHED_LOCALES, SOURCE_LOCALE, localizePath, LOCALE_META } =
  await import(pathToFileURL(serverEntry).href);
const template = readFileSync(resolve(distDir, "index.html"), "utf-8");

const ROOT = '<div id="root"></div>';
// Markers in index.html delimiting the route-specific head block (title, meta,
// canonical, JSON-LD). Between the markers sits the HOMEPAGE head, which is
// what dist/index.html must keep: it is served for "/" and as the SPA
// client-routing fallback shell.
const HEAD_START = "<!-- route-head:start -->";
const HEAD_END = "<!-- route-head:end -->";

// Build the hreflang alternate <link>s for a route: one per locale in `locales`
// (each pointing at that locale's equivalent URL) plus x-default → English.
// `locales` defaults to every PUBLISHED locale (chrome/marketing pages); blog
// articles pass their per-article approved set so hreflang never advertises a
// locale variant that was not emitted (reciprocity).
function hreflangLinks(canonicalPath, locales = PUBLISHED_LOCALES) {
  const links = locales.map(
    (loc) =>
      `<link rel="alternate" hreflang="${loc}" href="${SITE_URL}${localizePath(canonicalPath, loc)}" />`,
  );
  links.push(
    `<link rel="alternate" hreflang="x-default" href="${SITE_URL}${canonicalPath}" />`,
  );
  return links.join("\n    ");
}

// Set <html lang>. English keeps lang="en" (no-op string replace); a prefixed
// locale swaps it to that locale.
function setHtmlLang(html, locale) {
  return html.replace('<html lang="en">', `<html lang="${locale}">`);
}

// Override <link rel="canonical"> to the localized (self) URL. Only used for
// prefixed locales — English pages already emit their correct root canonical, so
// the English output is never touched.
//
// The regex is tolerant of attribute order/extra attributes so it matches BOTH
// the static template canonical (`<link rel="canonical" href="…">`, home route)
// AND react-helmet's emitted form on every other route
// (`<link data-react-helmet="true" rel="canonical" href="…">`). A rel-first
// assumption silently left helmet-rendered pages on the English canonical.
function setCanonical(html, url) {
  return html.replace(/(<link\b[^>]*\brel="canonical"[^>]*\bhref=")[^"]*(")/, `$1${url}$2`);
}

// Localize the STATIC homepage head for a prefixed locale. The "/" route keeps
// the template head verbatim (it doubles as the SPA shell), so the locale-
// declaring tags hard-coded to English there must be swapped to match
// <html lang> / the localized URL — otherwise a published /de/ home advertises
// og:locale=en_US, og:url=<root>, and JSON-LD inLanguage="en" on a lang="de"
// page. Human-readable copy (title/description, JSON-LD name/description) is
// intentionally left until a translated catalog exists — the source strings for
// the static head are not yet extracted. English never runs this.
function localizeHomeHead(html, locale) {
  const meta = LOCALE_META[locale];
  const homeUrl = `${SITE_URL}${localizePath("/", locale)}`;
  return html
    .replace('<meta name="language" content="English" />', `<meta name="language" content="${meta.name}" />`)
    .replace('<meta property="og:locale" content="en_US" />', `<meta property="og:locale" content="${meta.ogLocale}" />`)
    .replace('<meta property="og:url" content="https://agusgonzaleznic.com/" />', `<meta property="og:url" content="${homeUrl}" />`)
    .replace('<meta name="twitter:url" content="https://agusgonzaleznic.com/" />', `<meta name="twitter:url" content="${homeUrl}" />`)
    .replace('"inLanguage": "en"', `"inLanguage": "${locale}"`);
}

// Replaces the template's homepage head block with the react-helmet output the
// route emitted during its render, then appends the hreflang alternates. Fails
// hard on a missing/empty <title> so a page without a <Helmet> can't silently
// ship the homepage head.
function injectRouteHead(html, route, helmet, extraHead) {
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
    extraHead,
  ]
    .filter(Boolean)
    .join("\n    ");

  return html.slice(0, start) + headTags + html.slice(end + HEAD_END.length);
}

// Critical-CSS inliner. For each prerendered page it inlines the above-the-fold
// CSS the page actually uses and rewrites the render-blocking
// <link rel="stylesheet"> to load asynchronously (media=print + onload swap,
// with a <noscript> fallback), so the stylesheet no longer blocks first paint.
//   fonts:false            — leave the hand-tuned inline @font-face untouched.
//   reduceInlineStyles:false — keep the existing critical <style> block.
//   pruneSource:false      — don't rewrite the source .css (the async load needs it).
// The CSP already allows inline styles + the onload handler (terraform/cdn.tf).
const beasties = new Beasties({
  path: distDir,
  publicPath: "/",
  preload: "swap",
  fonts: false,
  reduceInlineStyles: false,
  pruneSource: false,
  logLevel: "silent",
});

for (const locale of PUBLISHED_LOCALES) {
  // Load + activate this locale's catalog once before rendering its routes.
  await dynamicActivate(locale);
  const prefix = locale === SOURCE_LOCALE ? "" : `${locale}/`;

  for (const route of routes) {
    // Review gate: a blog article carries `approvedLocales`; skip emitting its
    // variant (and hreflang entry) for a locale that is not approved/auto. The
    // English (source) variant is always in the set, so it is never skipped.
    if (route.approvedLocales && !route.approvedLocales.includes(locale)) continue;
    const urlPath = localizePath(route.path, locale);
    const { html: appHtml, helmet } = render(urlPath, locale);
    const alternates = hreflangLinks(route.canonical, route.approvedLocales);

    // "/" keeps the template head untouched (the block between the markers IS
    // the homepage head); we only splice the hreflang alternates in before the
    // end marker. Every other route gets its own helmet-emitted head (with the
    // alternates appended).
    let html =
      route.path === "/"
        ? template.replace(HEAD_END, `${alternates}\n    ${HEAD_END}`)
        : injectRouteHead(template, route, helmet, alternates);

    // Localize <html lang> (no-op for English). For prefixed locales also point
    // the canonical at the localized self URL and localize the locale-declaring
    // tags of the static homepage head. English output is never touched.
    html = setHtmlLang(html, locale);
    if (locale !== SOURCE_LOCALE) {
      const wantCanonical = `${SITE_URL}${localizePath(route.canonical, locale)}`;
      html = setCanonical(html, wantCanonical);
      if (route.path === "/") html = localizeHomeHead(html, locale);

      // Guard: a prefixed page MUST self-canonicalize to its /{locale}/ URL. If
      // setCanonical failed to match (e.g. helmet changed its tag shape), a
      // localized page would canonicalize to English and be de-indexed — fail
      // the build loudly instead of shipping that.
      const got = html.match(/<link\b[^>]*\brel="canonical"[^>]*\bhref="([^"]*)"/)?.[1];
      if (got !== wantCanonical) {
        throw new Error(
          `Prerender ${urlPath}: canonical is ${got ?? "MISSING"}, expected ${wantCanonical}. ` +
            `setCanonical() did not localize the canonical link.`,
        );
      }
    }

    if (!html.includes(ROOT)) {
      throw new Error(`Could not find "${ROOT}" in dist/index.html to inject prerendered markup.`);
    }

    html = html.replace(ROOT, `<div id="root">${appHtml}</div>`);

    // Inline critical CSS + defer the full stylesheet (before write, so the
    // .gz/.br copies below match). Runs on the fully-injected markup.
    html = await beasties.process(html);

    const outFile = resolve(distDir, `${prefix}${route.file}`);
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, html);

    // The client build precompressed the pre-injection index.html, so refresh
    // the .gz/.br copies to match the prerendered output (vite-plugin-compression
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

    console.log(`✓ Prerendered ${urlPath} → dist/${prefix}${route.file} (${appHtml.length} chars)`);
  }
}

// Feeds go last so llms.txt/sitemap.xml overwrite the copies vite made from
// public/. Pass the locale config so sitemap/hreflang/llms.txt iterate the same
// PUBLISHED_LOCALES as the prerender loop.
await generateFeeds({ PUBLISHED_LOCALES, SOURCE_LOCALE, localizePath });

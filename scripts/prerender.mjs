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
// published locale's equivalent URL + x-default → the English URL). All six
// locales (en + de/es/fr/it/pt) are published, so every route is emitted at the
// root AND under each /{locale}/ prefix, each with the full reciprocal
// hreflang set.
//
// Pure Node (no headless browser), so it's fast and CI-friendly.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
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
//
// `sitemap` carries this route's sitemap metadata and is passed straight through
// to generate-feeds. It lives HERE, on the route, because generate-feeds used to
// keep its OWN copy of the page list — a third hand-synced route set that had
// already drifted: /links was prerendered and indexable in all six locales while
// being absent from sitemap.xml entirely. One list now feeds both, and the
// assertion at the end of this file fails the build if any emitted page is
// missing from the sitemap.
const routes = [
  { path: "/", file: "index.html", canonical: "/", sitemap: { changefreq: "weekly", priority: "1.0", homeImages: true } },
  { path: "/about", file: "about/index.html", canonical: "/about", sitemap: { changefreq: "monthly", priority: "0.9" } },
  { path: "/philosophy", file: "philosophy/index.html", canonical: "/philosophy", sitemap: { changefreq: "monthly", priority: "0.8" } },
  { path: "/services", file: "services/index.html", canonical: "/services", sitemap: { changefreq: "monthly", priority: "0.9" } },
  { path: "/impact", file: "impact/index.html", canonical: "/impact", sitemap: { changefreq: "monthly", priority: "0.8" } },
  { path: "/faq", file: "faq/index.html", canonical: "/faq", sitemap: { changefreq: "monthly", priority: "0.7" } },
  { path: "/contact", file: "contact/index.html", canonical: "/contact", sitemap: { changefreq: "monthly", priority: "0.8" } },
  { path: "/links", file: "links/index.html", canonical: "/links", sitemap: { changefreq: "monthly", priority: "0.5" } },
  { path: "/impressum", file: "impressum/index.html", canonical: "/impressum", sitemap: { changefreq: "yearly", priority: "0.3" } },
  { path: "/privacy", file: "privacy/index.html", canonical: "/privacy", sitemap: { changefreq: "yearly", priority: "0.3" } },
];

// Blog routes come from the build-time Storyblok fetch (scripts/fetch-blog.mjs).
if (!existsSync(blogDataFile)) {
  throw new Error(
    "src/generated/blog-data.json not found — run `npm run fetch-blog` (part of `npm run build`) first.",
  );
}
const blogPosts = JSON.parse(readFileSync(blogDataFile, "utf-8"));
routes.push({ path: "/blog", file: "blog/index.html", canonical: "/blog/", sitemap: { changefreq: "weekly", priority: "0.8" } });
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

// Replace exactly one occurrence or fail the build — a silent non-match would
// ship a half-localized (or stale-English) home head for a published locale.
function replaceExactlyOnce(html, re, replacement, what, locale) {
  let n = 0;
  const out = html.replace(re, (...m) => {
    n += 1;
    return replacement(...m);
  });
  if (n !== 1) {
    throw new Error(
      `localizeHomeHead(${locale}): expected exactly 1 match for ${what}, got ${n}.`,
    );
  }
  return out;
}

// Localize the STATIC homepage head for a prefixed locale. The "/" route keeps
// the template head verbatim (it doubles as the SPA shell), so the locale-
// declaring tags hard-coded to English there must be swapped to match
// <html lang> / the localized URL — otherwise a published /de/ home advertises
// og:locale=en_US, og:url=<root>, and JSON-LD inLanguage="en" on a lang="de"
// page. The human-readable title/description now localize too: Index.tsx emits
// them through Lingui, so this per-locale render's helmet output carries the
// translated (and already HTML-escaped) strings — inject them into all seven
// title/description tags of the static block. English never runs this (its
// helmet text is byte-identical to the template anyway).
function localizeHomeHead(html, locale, helmet) {
  const meta = LOCALE_META[locale];
  const homeUrl = `${SITE_URL}${localizePath("/", locale)}`;

  // react-helmet output is already HTML-escaped — extract and inject verbatim.
  const title = helmet.title.toString().replace(/<[^>]*>/g, "").trim();
  const description = helmet.meta
    .toString()
    .match(/<meta[^>]*name="description"[^>]*content="([^"]*)"/)?.[1];
  if (!title || !description) {
    throw new Error(
      `localizeHomeHead(${locale}): could not extract localized title/description from the helmet output.`,
    );
  }

  html = replaceExactlyOnce(html, /(<title>)[^<]*(<\/title>)/, (_, a, b) => `${a}${title}${b}`, "<title>", locale);
  for (const [what, re, value] of [
    ["meta name=title", /(<meta name="title" content=")[^"]*(")/, title],
    ["meta description", /(<meta name="description" content=")[^"]*(")/, description],
    ["og:title", /(<meta property="og:title" content=")[^"]*(")/, title],
    ["og:description", /(<meta property="og:description" content=")[^"]*(")/, description],
    ["twitter:title", /(<meta name="twitter:title" content=")[^"]*(")/, title],
    ["twitter:description", /(<meta name="twitter:description" content=")[^"]*(")/, description],
  ]) {
    html = replaceExactlyOnce(html, re, (_, a, b) => `${a}${value}${b}`, what, locale);
  }

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
    // Render at the CANONICAL path, not `route.path`.
    //
    // The two differ only in the blog subtree (path /blog, canonical /blog/).
    // Rendering at the bare form made every language-switcher anchor on a blog
    // page point at the bare form too — the switcher derives its hrefs from
    // useLocation().pathname — so each of those links took a 301 to the slash
    // form. That is 10 anchors per page (the nav dropdown and the footer both
    // render the switcher, and both keep their anchors in the DOM for crawlers)
    // across 4 blog routes x 6 locales.
    //
    // Safe because nothing else derives meaning from the render path: canonical
    // and og:url come from SeoPage's explicit `path` prop, React Router v6
    // normalises trailing slashes when matching (so /de/blog/ still matches
    // `blog` and /de/blog/x/ still matches `blog/:slug`), src/lib/blog.ts
    // already strips a trailing slash off the slug, and Navigation's active
    // state uses startsWith("/blog"). The canonical guard below would fail the
    // build if this did move a canonical.
    const urlPath = localizePath(route.canonical, locale);
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
      if (route.path === "/") html = localizeHomeHead(html, locale, helmet);

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

// 404 page. Rendered once in the source locale to dist/404.html and served with
// a REAL HTTP 404 for any unknown path (terraform/cdn.tf custom_error_response →
// /404.html; GitHub Pages also uses 404.html natively). Deliberately NOT in
// `routes` or the sitemap, and carries no canonical/hreflang. NotFound sets a
// <title> + robots=noindex via <Helmet>, so injectRouteHead accepts it and
// crawlers drop unknown/removed URLs cleanly instead of as soft-404s.
await dynamicActivate(SOURCE_LOCALE);
{
  const { html: appHtml, helmet } = render("/__not-found__", SOURCE_LOCALE);
  let html = injectRouteHead(template, { path: "/404" }, helmet, "");
  html = setHtmlLang(html, SOURCE_LOCALE);
  if (!html.includes(ROOT)) {
    throw new Error(`Could not find "${ROOT}" in dist/index.html to inject the 404 markup.`);
  }
  html = html.replace(ROOT, `<div id="root">${appHtml}</div>`);
  html = await beasties.process(html);
  const outFile = resolve(distDir, "404.html");
  writeFileSync(outFile, html);
  const buf = Buffer.from(html);
  if (buf.length > 1024) {
    writeFileSync(`${outFile}.gz`, gzipSync(buf, { level: 9 }));
    writeFileSync(
      `${outFile}.br`,
      brotliCompressSync(buf, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 } }),
    );
  }
  console.log(`✓ Prerendered 404 → dist/404.html (${appHtml.length} chars)`);
}

// Feeds go last so llms.txt/sitemap.xml overwrite the copies vite made from
// public/. Pass the locale config so sitemap/hreflang/llms.txt iterate the same
// PUBLISHED_LOCALES as the prerender loop.
await generateFeeds({ PUBLISHED_LOCALES, SOURCE_LOCALE, localizePath, routes });

// Every indexable page we emitted must appear in the sitemap.
//
// This runs AFTER generateFeeds (which writes sitemap.xml) and walks the actual
// dist/ output rather than any in-memory list, so it catches a page that is
// emitted but unlisted no matter which list drifted. That is not hypothetical:
// /links was prerendered and indexable in all six locales while missing from
// sitemap.xml entirely, because generate-feeds kept its own copy of the page
// list. 404.html is excluded — it is deliberately noindex and deliberately
// absent from the sitemap.
{
  const sitemapXml = readFileSync(resolve(distDir, "sitemap.xml"), "utf-8");
  const listed = new Set(
    [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
      new URL(m[1]).pathname.replace(/\/index\.html$/, ""),
    ),
  );

  const emitted = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "index.html") emitted.push(full);
    }
  };
  walk(distDir);

  const orphans = [];
  for (const file of emitted) {
    const html = readFileSync(file, "utf-8");
    // Skip anything we deliberately keep out of the index.
    if (/<meta[^>]+name="robots"[^>]+noindex/i.test(html)) continue;
    // Attribute ORDER is not guaranteed: react-helmet emits
    // `<link data-react-helmet="true" rel="canonical" href="...">`, so a
    // rel-first regex silently matches nothing on every helmet-rendered page.
    // (setCanonical above carries the same warning — same trap, same file.)
    const canonicalTag = [...html.matchAll(/<link\b[^>]*>/g)]
      .map((m) => m[0])
      .find((tag) => /rel="canonical"/.test(tag));
    const canonical = canonicalTag?.match(/href="([^"]+)"/)?.[1];
    if (!canonical) {
      orphans.push(`${file} (no canonical)`);
      continue;
    }
    const path = new URL(canonical).pathname;
    if (!listed.has(path) && !listed.has(path.replace(/\/$/, ""))) {
      orphans.push(`${path} (${file.replace(`${distDir}/`, "")})`);
    }
  }

  if (orphans.length) {
    throw new Error(
      `Sitemap does not cover ${orphans.length} indexable page(s):\n  ${orphans.join("\n  ")}\n` +
        "Add the route's `sitemap` metadata in scripts/prerender.mjs, or mark the page noindex.",
    );
  }
  console.log(`✓ Sitemap covers all ${emitted.length} emitted page(s)`);
}

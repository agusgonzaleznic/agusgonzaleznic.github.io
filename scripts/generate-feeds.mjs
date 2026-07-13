// Post-prerender feed generation (called by scripts/prerender.mjs at the end).
//
// From src/generated/blog-data.json it writes into dist/:
//   - sitemap.xml     (replaces the former static public/sitemap.xml)
//   - blog/rss.xml    (RSS 2.0)
//   - llms.txt        (public/llms.txt as base template + appended "## Blog" section;
//                      overwrites the copy vite made from public/ during build:client)
//
// i18n: sitemap entries and llms.txt iterate PUBLISHED_LOCALES. Each sitemap
// <url> carries a COMPLETE set of <xhtml:link rel="alternate"> hreflang entries
// (one per published locale + x-default → English). English llms.txt stays at
// the root (dist/llms.txt); a prefixed locale writes dist/{locale}/llms.txt from
// its own translated brief (public/{locale}/llms.txt). Today PUBLISHED_LOCALES =
// ["en"], so only English URLs/files are emitted and the only sitemap delta is a
// self hreflang="en" + x-default (both harmless, same URL). The blog RSS stays
// English-only (a single feed).
//
// Generated files >1kb get .gz/.br siblings, matching the prerender convention.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync, brotliCompressSync, constants as zlibConstants } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const distDir = resolve(projectRoot, "dist");
const serverEntry = resolve(projectRoot, "dist-server/entry-server.js");
const blogDataFile = resolve(projectRoot, "src/generated/blog-data.json");

const SITE_URL = "https://agusgonzaleznic.com";
const BLOG_TITLE = "Agustin Gonzalez Nicolini — Blog";
const BLOG_DESCRIPTION =
  "Writing on engineering leadership, executive coaching, and building teams that ship.";

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Storyblok datetime fields come as "YYYY-MM-DD HH:mm" (UTC, no zone marker);
// published_at/first_published_at are full ISO strings.
function toDate(value) {
  if (!value) return null;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}:00Z`
    : value;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Authored publish date — same priority as src/lib/blog.ts postDate(), so RSS
// pubDate matches the rendered pages and doesn't jump on every CMS re-publish
// (Storyblok bumps published_at each time a story is re-published).
function postDate(post) {
  return (
    toDate(post.published_date) ?? toDate(post.first_published_at) ?? toDate(post.published_at)
  );
}

// "Last modified" for the sitemap — here published_at's re-publish semantics
// are exactly what we want.
function postModified(post) {
  return toDate(post.published_at) ?? postDate(post);
}

function writeCompressed(outFile, content) {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, content);
  const buf = Buffer.from(content);
  if (buf.length > 1024) {
    writeFileSync(`${outFile}.gz`, gzipSync(buf, { level: 9 }));
    writeFileSync(
      `${outFile}.br`,
      brotliCompressSync(buf, {
        params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
      }),
    );
  }
}

// The <xhtml:link> alternates for a canonical path: one per locale in `locales`
// (each at that locale's equivalent URL) + x-default → English. `locales`
// defaults to every published locale; blog articles pass their per-article
// approved set so the sitemap never advertises an un-emitted variant. Indented
// to sit inside a <url> element (4 spaces).
function alternateLinks(canonicalPath, cfg, locales = cfg.PUBLISHED_LOCALES) {
  const links = locales.map(
    (loc) =>
      `    <xhtml:link rel="alternate" hreflang="${loc}" href="${xmlEscape(
        `${SITE_URL}${cfg.localizePath(canonicalPath, loc)}`,
      )}" />`,
  );
  links.push(
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(`${SITE_URL}${canonicalPath}`)}" />`,
  );
  return links.join("\n");
}

// One <url> per emitted locale for a page, each with the matching alternate set.
// A page's `locales` (blog articles) defaults to every published locale.
function urlEntries(page, cfg) {
  const locales = page.locales ?? cfg.PUBLISHED_LOCALES;
  return locales.map((loc) => {
    const loc_url = xmlEscape(`${SITE_URL}${cfg.localizePath(page.canonical, loc)}`);
    const alternates = alternateLinks(page.canonical, cfg, locales);
    const images = page.images ? `\n${page.images}` : "";
    return `  <url>
    <loc>${loc_url}</loc>
    <lastmod>${page.lastmod}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
${alternates}${images}
  </url>`;
  }).join("\n");
}

function buildSitemap(posts, cfg) {
  const today = new Date().toISOString().slice(0, 10);
  const homeImages = `    <image:image>
      <image:loc>${SITE_URL}/profile.jpg</image:loc>
      <image:title>Agustin Gonzalez Nicolini, engineering leadership coach in Berlin</image:title>
      <image:caption>Portrait of Agustin Gonzalez Nicolini, coach to CTOs, VPs of Engineering, and engineering managers worldwide</image:caption>
    </image:image>
    <image:image>
      <image:loc>${SITE_URL}/og-image.webp</image:loc>
      <image:title>Engineering leadership and executive coaching — agusgonzaleznic.com preview</image:title>
    </image:image>`;

  const pages = [
    { canonical: "/", lastmod: today, changefreq: "weekly", priority: "1.0", images: homeImages },
    { canonical: "/impressum", lastmod: today, changefreq: "yearly", priority: "0.3" },
    { canonical: "/privacy", lastmod: today, changefreq: "yearly", priority: "0.3" },
    { canonical: "/blog/", lastmod: today, changefreq: "weekly", priority: "0.8" },
    ...posts.map((post) => ({
      canonical: `/blog/${post.slug}/`,
      lastmod: (postModified(post) ?? new Date()).toISOString().slice(0, 10),
      changefreq: "monthly",
      priority: "0.7",
      // Review gate: sitemap <url> + alternates only for this article's
      // approved/auto locales (matches what prerender emitted).
      locales: post.approved_locales,
    })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${pages.map((page) => urlEntries(page, cfg)).join("\n")}
</urlset>
`;
}

function buildRss(posts) {
  const items = posts.map((post) => {
    const url = xmlEscape(`${SITE_URL}/blog/${post.slug}/`);
    const pubDate = postDate(post);
    return `    <item>
      <title>${xmlEscape(post.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>${
        pubDate ? `\n      <pubDate>${pubDate.toUTCString()}</pubDate>` : ""
      }
      <description>${xmlEscape(post.excerpt)}</description>
    </item>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(BLOG_TITLE)}</title>
    <link>${SITE_URL}/blog/</link>
    <description>${xmlEscape(BLOG_DESCRIPTION)}</description>
    <language>en-us</language>
    <atom:link href="${SITE_URL}/blog/rss.xml" rel="self" type="application/rss+xml"/>
${items.join("\n")}
  </channel>
</rss>
`;
}

function buildLlmsTxt(posts, templatePath) {
  const base = readFileSync(templatePath, "utf-8").trimEnd();
  if (posts.length === 0 || /^## Blog$/m.test(base)) return `${base}\n`;

  const entries = posts.map((post) => {
    // llmstxt.org file-list format: "- [name](url): notes". Escape ] in titles
    // so it can't break out of the link text.
    const title = String(post.title).replace(/\]/g, "\\]");
    const excerpt = String(post.excerpt).replace(/\s+/g, " ").trim();
    return `- [${title}](${SITE_URL}/blog/${post.slug}/)${excerpt ? `: ${excerpt}` : ""}`;
  });
  const blog = `## Blog\n\n${entries.join("\n")}`;
  // Keep "## Optional" last (llmstxt.org convention): splice Blog before it.
  const i = base.search(/^## Optional$/m);
  return i === -1
    ? `${base}\n\n${blog}\n`
    : `${base.slice(0, i).trimEnd()}\n\n${blog}\n\n${base.slice(i).trimEnd()}\n`;
}

// The locale config (PUBLISHED_LOCALES/SOURCE_LOCALE/localizePath) comes from the
// compiled server bundle so it stays in sync with src/i18n. prerender.mjs passes
// it in; standalone runs load it here.
async function loadI18nConfig() {
  const { PUBLISHED_LOCALES, SOURCE_LOCALE, localizePath } = await import(
    pathToFileURL(serverEntry).href
  );
  return { PUBLISHED_LOCALES, SOURCE_LOCALE, localizePath };
}

export async function generateFeeds(i18nConfig) {
  const cfg = i18nConfig ?? (await loadI18nConfig());
  const posts = JSON.parse(readFileSync(blogDataFile, "utf-8"));

  writeCompressed(resolve(distDir, "sitemap.xml"), buildSitemap(posts, cfg));
  writeCompressed(resolve(distDir, "blog/rss.xml"), buildRss(posts));

  // Per-locale llms.txt: English at the root, others under /{locale}/ from their
  // own translated brief (public/{locale}/llms.txt). A locale without a brief yet
  // is skipped rather than emitting an English copy under its prefix.
  const rootBrief = resolve(projectRoot, "public/llms.txt");
  for (const locale of cfg.PUBLISHED_LOCALES) {
    const prefix = locale === cfg.SOURCE_LOCALE ? "" : `${locale}/`;
    // Prefer a translated brief (public/{locale}/llms.txt); otherwise fall back
    // to the English brief so /{locale}/llms.txt is still a valid Markdown file
    // (H1 + summary) rather than the SPA HTML fallback GitHub Pages would serve
    // for a missing path — which crawlers reject as a malformed llms.txt.
    const localeBrief = resolve(projectRoot, `public/${locale}/llms.txt`);
    const templatePath =
      locale !== cfg.SOURCE_LOCALE && existsSync(localeBrief) ? localeBrief : rootBrief;
    writeCompressed(resolve(distDir, `${prefix}llms.txt`), buildLlmsTxt(posts, templatePath));
  }

  console.log(
    `✓ Generated dist/sitemap.xml, dist/blog/rss.xml, llms.txt (${posts.length} post(s), ${cfg.PUBLISHED_LOCALES.length} locale(s))`,
  );
}

// Allow standalone runs: node scripts/generate-feeds.mjs
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!existsSync(distDir)) {
    console.error("generate-feeds: dist/ not found — run the build first.");
    process.exit(1);
  }
  await generateFeeds();
}

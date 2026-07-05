// Post-prerender feed generation (called by scripts/prerender.mjs at the end).
//
// From src/generated/blog-data.json it writes into dist/:
//   - sitemap.xml     (replaces the former static public/sitemap.xml)
//   - blog/rss.xml    (RSS 2.0)
//   - llms.txt        (public/llms.txt as base template + appended "## Blog" section;
//                      overwrites the copy vite made from public/ during build:client)
//
// Generated files >1kb get .gz/.br siblings, matching the prerender convention.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, brotliCompressSync, constants as zlibConstants } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const distDir = resolve(projectRoot, "dist");
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

function buildSitemap(posts) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    `  <url>
    <loc>${SITE_URL}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <image:image>
      <image:loc>${SITE_URL}/profile.jpg</image:loc>
      <image:title>Agustin Gonzalez Nicolini, engineering leadership coach in Berlin</image:title>
      <image:caption>Portrait of Agustin Gonzalez Nicolini, coach to CTOs, VPs of Engineering, and engineering managers worldwide</image:caption>
    </image:image>
    <image:image>
      <image:loc>${SITE_URL}/og-image.webp</image:loc>
      <image:title>Engineering leadership and executive coaching — agusgonzaleznic.com preview</image:title>
    </image:image>
  </url>`,
    ...["impressum", "privacy"].map(
      (slug) => `  <url>
    <loc>${SITE_URL}/${slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>`,
    ),
    `  <url>
    <loc>${SITE_URL}/blog/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`,
    ...posts.map((post) => {
      const lastmod = (postModified(post) ?? new Date()).toISOString().slice(0, 10);
      return `  <url>
    <loc>${xmlEscape(`${SITE_URL}/blog/${post.slug}/`)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
    }),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join("\n")}
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

function buildLlmsTxt(posts) {
  const base = readFileSync(resolve(projectRoot, "public/llms.txt"), "utf-8").trimEnd();
  if (posts.length === 0 || /^## Blog$/m.test(base)) return `${base}\n`;

  const entries = posts.map((post) => {
    const excerpt = String(post.excerpt).replace(/\s+/g, " ").trim();
    return `- ${post.title} — ${SITE_URL}/blog/${post.slug}/${excerpt ? ` — ${excerpt}` : ""}`;
  });
  return `${base}\n\n## Blog\n\n${entries.join("\n")}\n`;
}

export function generateFeeds() {
  const posts = JSON.parse(readFileSync(blogDataFile, "utf-8"));

  writeCompressed(resolve(distDir, "sitemap.xml"), buildSitemap(posts));
  writeCompressed(resolve(distDir, "blog/rss.xml"), buildRss(posts));
  writeCompressed(resolve(distDir, "llms.txt"), buildLlmsTxt(posts));

  console.log(
    `✓ Generated dist/sitemap.xml, dist/blog/rss.xml, dist/llms.txt (${posts.length} post(s))`,
  );
}

// Allow standalone runs: node scripts/generate-feeds.mjs
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!existsSync(distDir)) {
    console.error("generate-feeds: dist/ not found — run the build first.");
    process.exit(1);
  }
  generateFeeds();
}

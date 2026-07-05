// Build-time Storyblok fetch. Runs before `vite build` (and before `vite` dev via
// predev) so src/generated/blog-data.json always exists when the app imports it.
//
// SECURITY: reads process.env.STORYBLOK_PUBLIC_TOKEN — never import.meta.env or a
// VITE_-prefixed var — so the token cannot reach the client bundle. The fetched
// content is public and safe to bake in.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(__dirname, "../src/generated/blog-data.json");

// EU space (288632938663524) → EU CDA host.
const API_BASE = "https://api.storyblok.com/v2/cdn/stories";
const PER_PAGE = 100; // CDA max

const token = process.env.STORYBLOK_PUBLIC_TOKEN;
// draft override is for local preview builds only (requires a preview token).
const version = process.env.STORYBLOK_VERSION === "draft" ? "draft" : "published";
// The PR CI workflow (reusable vite-ci.yml) cannot receive secrets, so a
// missing token only fails builds that opt in — deploy.yml sets
// STORYBLOK_REQUIRE_TOKEN=1 so production can never ship an empty blog by
// accident, while PR CI validates the empty-blog code path.
const requireToken = process.env.STORYBLOK_REQUIRE_TOKEN === "1";

function writeOutput(posts) {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(posts, null, 2)}\n`);
}

if (!token) {
  if (requireToken) {
    console.error(
      "fetch-blog: STORYBLOK_PUBLIC_TOKEN is not set but STORYBLOK_REQUIRE_TOKEN=1 " +
        "(deploy builds must provide the repo secret via deploy.yml build-env-vars).",
    );
    process.exit(1);
  }
  console.warn(
    "\n⚠ fetch-blog: STORYBLOK_PUBLIC_TOKEN not set — writing empty blog data.\n" +
      "  The blog will be EMPTY in this build (expected for PR CI and tokenless local builds).\n",
  );
  writeOutput([]);
  process.exit(0);
}

async function fetchPage(page, cv) {
  const params = new URLSearchParams({
    token,
    version,
    starts_with: "blog/",
    content_type: "blog_post",
    sort_by: "content.published_date:desc",
    per_page: String(PER_PAGE),
    page: String(page),
  });
  // Reuse the first response's cv on later pages for a consistent CDN snapshot.
  if (cv) params.set("cv", String(cv));
  const res = await fetch(`${API_BASE}?${params}`);
  if (!res.ok) {
    // Never echo the request URL — it contains the token.
    throw new Error(`Storyblok CDA responded ${res.status} ${res.statusText} (page ${page})`);
  }
  const body = await res.json();
  return { body, total: Number(res.headers.get("total") ?? 0) };
}

try {
  const stories = [];
  const first = await fetchPage(1);
  stories.push(...first.body.stories);
  const totalPages = Math.ceil(first.total / PER_PAGE);
  for (let page = 2; page <= totalPages; page += 1) {
    const { body } = await fetchPage(page, first.body.cv);
    stories.push(...body.stories);
  }

  const posts = stories.map((story) => ({
    slug: story.slug,
    full_slug: story.full_slug,
    title: story.content.title || story.name,
    excerpt: story.content.excerpt ?? "",
    body: story.content.body ?? null,
    cover_image: story.content.cover_image?.filename ? story.content.cover_image : null,
    published_date: story.content.published_date || null,
    first_published_at: story.first_published_at ?? null,
    published_at: story.published_at ?? null,
    original_url: story.content.original_url ?? "",
    seo_title: story.content.seo_title ?? "",
    seo_description: story.content.seo_description ?? "",
    canonical_override: story.content.canonical_override ?? "",
    tag_list: story.tag_list ?? [],
    uuid: story.uuid,
  }));

  if (posts.length === 0) {
    if (process.env.STORYBLOK_REQUIRE_POSTS === "1") {
      console.error(
        "fetch-blog: token is set but 0 posts were returned, and STORYBLOK_REQUIRE_POSTS=1.",
      );
      process.exit(1);
    }
    console.warn(
      "⚠ fetch-blog: token is set but 0 published posts found under blog/ — writing empty blog data.",
    );
  }

  writeOutput(posts);
  console.log(
    `✓ fetch-blog: ${posts.length} post(s) (version=${version}) → src/generated/blog-data.json`,
  );
} catch (err) {
  console.error(`fetch-blog: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

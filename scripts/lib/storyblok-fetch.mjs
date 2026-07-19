// Shared Storyblok CDA fetch + post mapping. Used by BOTH fetch-blog.mjs (the
// build) and review-translations.mjs (the local review tool) so the two can never
// drift on the post shape — the reviewed content the review tool writes MUST
// match the schema fetch-blog serves.
//
// SECURITY: the token travels only in the query string; a non-OK response never
// echoes the URL (it holds the token).

// EU space (288632938663524) → EU CDA host.
const API_BASE = "https://api.storyblok.com/v2/cdn/stories";
const PER_PAGE = 100; // CDA max

/** Map a Storyblok story to the app's blog-post shape (single source of truth). */
export function mapStory(story) {
  return {
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
  };
}

/**
 * Fetch all blog posts from Storyblok, mapped to the app's post shape.
 * `version` is "published" (default) or "draft". Throws on a non-OK response
 * without leaking the token; returns [] only if Storyblok returns no stories.
 */
export async function fetchPublishedPosts({ token, version = "published" }) {
  if (!token) throw new Error("fetchPublishedPosts: token is required");

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
      throw new Error(`Storyblok CDA responded ${res.status} ${res.statusText} (page ${page})`);
    }
    const body = await res.json();
    return { body, total: Number(res.headers.get("total") ?? 0) };
  }

  const stories = [];
  const first = await fetchPage(1);
  stories.push(...first.body.stories);
  const totalPages = Math.ceil(first.total / PER_PAGE);
  for (let page = 2; page <= totalPages; page += 1) {
    const { body } = await fetchPage(page, first.body.cv);
    stories.push(...body.stories);
  }
  return stories.map(mapStory);
}

// ── Marketing pages ────────────────────────────────────────────────────────
// The `page` content type is a body of section blocks. Unlike blog posts (one
// flat shape), pages carry arbitrary nested block trees, so we strip Storyblok's
// editor-only keys and pass every content field through verbatim — the app's
// components read the fields by name (see src/lib/pages.ts + the section
// components). Kept in this shared module so the build + any future automation
// never drift on the page shape.

const STORYBLOK_META_KEYS = new Set(["_uid", "_editable"]);

/** Recursively drop Storyblok editor-only keys; keep `component` + all content. */
function stripStoryblok(value) {
  if (Array.isArray(value)) return value.map(stripStoryblok);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (STORYBLOK_META_KEYS.has(k)) continue;
      out[k] = stripStoryblok(v);
    }
    return out;
  }
  return value;
}

/** Map a Storyblok `page` story to the app's page shape (single source of truth). */
export function mapPage(story) {
  const c = story.content ?? {};
  return {
    slug: story.slug,
    full_slug: story.full_slug,
    seo_title: c.seo_title ?? "",
    seo_description: c.seo_description ?? "",
    // Optional per-page social image (Storyblok asset) → absolute URL, or "" to
    // fall back to the site banner. Never translated (it's an asset URL).
    og_image: c.og_image?.filename ? c.og_image.filename : "",
    blocks: Array.isArray(c.body) ? c.body.map(stripStoryblok) : [],
    uuid: story.uuid,
  };
}

/**
 * Fetch every story under a prefix for a content type, mapped with `mapper`.
 * Used for marketing pages (`starts_with:"pages/"`, `content_type:"page"`).
 * Throws on a non-OK response without leaking the token.
 */
export async function fetchStoriesByPrefix({
  token,
  version = "published",
  starts_with,
  content_type,
  mapper = mapPage,
}) {
  if (!token) throw new Error("fetchStoriesByPrefix: token is required");

  async function fetchPage(page, cv) {
    const params = new URLSearchParams({
      token,
      version,
      starts_with,
      content_type,
      per_page: String(PER_PAGE),
      page: String(page),
    });
    if (cv) params.set("cv", String(cv));
    const res = await fetch(`${API_BASE}?${params}`);
    if (!res.ok) {
      throw new Error(`Storyblok CDA responded ${res.status} ${res.statusText} (page ${page})`);
    }
    const body = await res.json();
    return { body, total: Number(res.headers.get("total") ?? 0) };
  }

  const stories = [];
  const first = await fetchPage(1);
  stories.push(...first.body.stories);
  const totalPages = Math.ceil(first.total / PER_PAGE);
  for (let page = 2; page <= totalPages; page += 1) {
    const { body } = await fetchPage(page, first.body.cv);
    stories.push(...body.stories);
  }
  return stories.map(mapper);
}

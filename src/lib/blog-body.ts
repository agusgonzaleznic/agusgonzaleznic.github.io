// Article bodies, loaded ONLY on an article route.
//
// src/lib/blog.ts globs blog-index.<locale>.json (no body, ~4 KB each). The
// bodies are ~93% of the corpus and ~80 KB each, and the /blog index does not
// need them: fetch-blog bakes reading_minutes so PostCard/PostMeta never touch
// article text. Importing this module from anywhere the index route reaches
// would undo that, so it has exactly one consumer, src/pages/BlogPost.tsx,
// which is already its own lazy chunk.
import blogBody from "@/generated/blog-body.json";
import { SOURCE_LOCALE } from "@/i18n/locales";
import type { RichtextNode } from "./richtext";

type BodyMap = Record<string, RichtextNode | null>;

const enBodies = (blogBody ?? {}) as BodyMap;

const localeBodies = import.meta.glob<BodyMap>("../generated/blog-body.*.json", {
  eager: true,
  import: "default",
});

/**
 * The body for `slug` from `corpusLocale`'s corpus.
 *
 * `corpusLocale` must be what postCorpusLocale() returned for the same
 * (slug, locale), NOT the requested locale. getPost() deliberately falls back
 * to the English article when a locale has no approved variant, and pairing that
 * post with a lookup keyed on the requested locale would render an article with
 * no text at all.
 */
export function getPostBody(slug: string, corpusLocale: string = SOURCE_LOCALE): RichtextNode | null {
  const clean = slug.replace(/\/+$/, "");
  if (corpusLocale !== SOURCE_LOCALE) {
    const map = localeBodies[`../generated/blog-body.${corpusLocale}.json`];
    if (map && clean in map) return map[clean] ?? null;
  }
  return enBodies[clean] ?? null;
}

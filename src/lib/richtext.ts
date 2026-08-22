// Richtext types and pure helpers, with NO blog-data import.
//
// These used to live in src/lib/blog.ts, which eagerly globs six locales of blog
// JSON. Anything importing storyblokImage or extractText from there inherited
// that payload into its own chunk — RichText and StoryblokPage both did, which is
// the same defect as the SITE_URL move in 1a97e41. Keeping them here means a
// component that needs an image transform does not also download the corpus.

export interface RichtextMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface RichtextNode {
  type?: string;
  text?: string;
  content?: RichtextNode[];
  attrs?: Record<string, unknown>;
  marks?: RichtextMark[];
}

export interface BlogImage {
  filename: string;
  alt?: string;
  title?: string;
}

/** Concatenated plain text of a richtext subtree. */
export function extractText(node: RichtextNode | null | undefined): string {
  if (!node) return "";
  if (node.text) return node.text;
  if (!node.content?.length) return "";
  return node.content.map(extractText).join(" ");
}

/** Estimated reading time in whole minutes (200 wpm, min 1).
 *
 *  Still exported for any caller holding a body in memory, but the /blog index
 *  no longer uses it: fetch-blog bakes `reading_minutes` into blog-index so the
 *  index route does not need the article bodies at all. */
export function readingTime(body: RichtextNode | null): number {
  const words = extractText(body).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/**
 * Storyblok image service transform: appending /m/ resizes and auto-serves
 * WebP/AVIF. height 0 = proportional; a fixed height adds smart cropping.
 */
export function storyblokImage(filename: string, width: number, height = 0): string {
  if (!/\/\/a\.storyblok\.com\//.test(filename)) return filename;
  const crop = height > 0 ? "/smart" : "";
  return `${filename}/m/${width}x${height}${crop}/filters:quality(80)`;
}

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

/**
 * Intrinsic pixel size from a Storyblok asset URL, or null.
 *
 * Storyblok encodes it in the path: /f/<space>/<W>x<H>/<hash>/<name>. Null is
 * load-bearing rather than a convenience: real assets in this space have no
 * WxH segment at all (an SVG is /f/288632938663524/375fba9742/x.svg), and a
 * caller must OMIT width/height in that case instead of guessing — a wrong
 * aspect-ratio box is worse than none.
 */
export function storyblokImageSize(filename: string): { width: number; height: number } | null {
  const m = /\/\/a\.storyblok\.com\/f\/\d+\/(\d+)x(\d+)\//.exec(filename);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * A srcset of Storyblok transforms.
 *
 * Returns "" for anything not on a.storyblok.com — storyblokImage passes those
 * URLs through untouched, so emitting one candidate per width would be the same
 * URL repeated with different `w` descriptors, which is actively wrong rather
 * than merely useless.
 *
 * Widths above the intrinsic width are dropped (never upscaled) and the intrinsic
 * width itself is included, so the largest candidate is the real asset. Filtering
 * is deliberate: clamping each width with Math.min instead would emit N identical
 * URLs carrying N different descriptors.
 */
export function storyblokSrcSet(filename: string, widths: number[]): string {
  if (!/\/\/a\.storyblok\.com\//.test(filename)) return "";
  const intrinsic = storyblokImageSize(filename)?.width;
  const usable = intrinsic
    ? [...new Set([...widths.filter((w) => w <= intrinsic), intrinsic])]
    : [...new Set(widths)];
  return usable
    .sort((a, b) => a - b)
    .map((w) => `${storyblokImage(filename, w)} ${w}w`)
    .join(", ");
}

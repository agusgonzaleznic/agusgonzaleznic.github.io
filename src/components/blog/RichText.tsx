import { Fragment, type ReactNode } from "react";
import {
  extractText,
  storyblokImage,
  storyblokImageSize,
  storyblokSrcSet,
  type RichtextMark,
  type RichtextNode,
} from "@/lib/richtext";
import { t } from "@lingui/core/macro";
import { SITE_URL } from "@/lib/site";
import { SOURCE_LOCALE, localeFromPath, localizePath } from "@/i18n/locales";

// Hand-rolled Storyblok richtext → React walker. Zero dependencies, pure and
// synchronous, so it runs identically under renderToString (prerender) and in
// the browser. Monochrome code blocks by design: syntax highlighting is a
// possible future enhancement, deliberately skipped to avoid a heavy dep.

interface Ctx {
  /** Dedupe heading anchor ids within one document. */
  ids: Map<string, number>;
  /**
   * The locale this document is being rendered for, threaded rather than read
   * from a hook so the walker stays pure and synchronous: it has to produce
   * byte-identical output under renderToString and in the browser, or hydration
   * mismatches.
   */
  locale: string;
  /** Inside list items / blockquotes: paragraphs drop their bottom margin. */
  compact: boolean;
  /** Added to every heading level so the document's top level lands on h2. */
  headingShift: number;
}

// CMS href values are untrusted, so they are parsed with the SAME URL parser the
// browser will use and then ALLOWLISTED by the resulting protocol.
//
// This replaced a blocklist over the raw string,
// !/^\s*(javascript|data|vbscript):/i, which was bypassable. WHATWG URL parsing
// STRIPS tab, LF and CR before resolving, so a tab inside the scheme never
// matched the pattern while the browser still navigated to javascript:.
// Confirmed against Node's parser for all three characters; a plain space is not
// stripped and so was never a bypass. An allowlist over the PARSED protocol
// cannot be fooled this way, because it asks the same question the browser does.
//
// `external` now comes from the same parse instead of a second, independent
// regex. That mattered: the old /^(https?:)?\/\// test returned false for a
// bypassing href, so the anchor got no target="_blank" and navigated in the SAME
// tab, which is precisely the case a browser does evaluate a javascript: URL.
// One parse means the guard and the target/rel decision cannot disagree again.
//
// The RAW string is what gets emitted as href, never the resolved absolute URL,
// so relative and locale-relative CMS links keep working unchanged. The parse is
// only used to decide.
//
// mailto: is permitted but never counted as external: it hands off to a mail
// client rather than opening a tab.
const SAFE_PROTOCOLS = new Set(["https:", "http:", "mailto:"]);

const classifyHref = (raw: string): { external: boolean } | null => {
  let url: URL;
  try {
    // Resolve against the site origin so scheme-less values (/about, #anchor)
    // are parseable at all.
    url = new URL(raw, SITE_URL);
  } catch {
    return null;
  }
  if (!SAFE_PROTOCOLS.has(url.protocol)) return null;
  return { external: url.protocol !== "mailto:" && url.origin !== SITE_URL };
};

const PARAGRAPH_CLASS = "text-fluid-base leading-relaxed text-muted-foreground";
const LINK_CLASS =
  "text-accent underline underline-offset-4 decoration-accent/40 hover:decoration-accent transition-colors";

/**
 * Give a CMS-authored internal link the reader's locale.
 *
 * A translated article's body is a translation of the ENGLISH body, so its
 * internal links are the English ones copied across: a German reader following
 * `/about` silently left the German site. Prefixing is the fix, but only for the
 * shape where it is unambiguous, because localizePath() blindly prepends and CMS
 * hrefs are authored by hand:
 *
 *   `#section`      a pure fragment. Prefixing gives `/de/#section`, which is a
 *                   different page. Left alone.
 *   `about`         relative. Resolves against the current URL, so prefixing it
 *                   would change what it means. Left alone.
 *   `https://…`     absolute, including the site's own origin. Left alone; an
 *                   author who typed the whole URL said what they meant.
 *   `/de/about`     already carries a locale, so the author was explicit. Left
 *                   alone, which also makes this function idempotent.
 *   `/about`        the actual case. Becomes `/de/about`.
 *
 * External links never reach here: the caller checks classifyHref first.
 */
const localizeCmsHref = (href: string, locale: string): string => {
  if (locale === SOURCE_LOCALE) return href;
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  if (localeFromPath(href) !== SOURCE_LOCALE) return href;
  return localizePath(href, locale);
};

const slugify = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-") || "section";

const headingId = (text: string, ctx: Ctx) => {
  const base = slugify(text);
  const seen = ctx.ids.get(base) ?? 0;
  ctx.ids.set(base, seen + 1);
  return seen === 0 ? base : `${base}-${seen}`;
};

const applyMark = (children: ReactNode, mark: RichtextMark, ctx: Ctx): ReactNode => {
  const attrs = mark.attrs ?? {};
  switch (mark.type) {
    case "bold":
      return <strong className="font-bold text-foreground">{children}</strong>;
    case "italic":
      return <em>{children}</em>;
    case "underline":
      return <u>{children}</u>;
    case "strike":
      return <s>{children}</s>;
    case "superscript":
      return <sup>{children}</sup>;
    case "subscript":
      return <sub>{children}</sub>;
    case "code":
      return (
        <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.875em] text-foreground">
          {children}
        </code>
      );
    case "link": {
      const linktype = String(attrs.linktype ?? "url");
      const anchor = attrs.anchor ? `#${String(attrs.anchor)}` : "";
      const href =
        linktype === "email"
          ? `mailto:${String(attrs.href ?? "")}`
          : `${String(attrs.href ?? "")}${anchor}`;
      const link = classifyHref(href);
      if (!link) return children;
      const { external } = link;
      return (
        <a
          href={external ? href : localizeCmsHref(href, ctx.locale)}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          className={LINK_CLASS}
        >
          {children}
        </a>
      );
    }
    default:
      return children;
  }
};

const renderTextNode = (node: RichtextNode, key: number, ctx: Ctx): ReactNode => {
  let el: ReactNode = node.text ?? "";
  for (const mark of node.marks ?? []) {
    el = applyMark(el, mark, ctx);
  }
  return <Fragment key={key}>{el}</Fragment>;
};

const renderChildren = (node: RichtextNode, ctx: Ctx): ReactNode =>
  node.content?.map((child, i) => renderNode(child, i, ctx));

const HEADING_CLASS: Record<number, string> = {
  2: "group scroll-mt-24 text-fluid-2xl font-bold mt-12 mb-5",
  3: "group scroll-mt-24 text-fluid-xl font-bold mt-10 mb-4",
};

const renderNode = (node: RichtextNode, key: number, ctx: Ctx): ReactNode => {
  switch (node.type) {
    case "paragraph":
      return (
        <p key={key} className={ctx.compact ? PARAGRAPH_CLASS : `${PARAGRAPH_CLASS} mb-6`}>
          {renderChildren(node, ctx)}
        </p>
      );

    case "heading": {
      const level = Math.min(
        Math.max(Number(node.attrs?.level ?? 2) + ctx.headingShift, 2),
        6,
      );
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      if (level === 2 || level === 3) {
        const id = headingId(extractText(node), ctx);
        return (
          <Tag key={key} id={id} className={HEADING_CLASS[level]}>
            {renderChildren(node, ctx)}
            <a
              href={`#${id}`}
              aria-label={t`Link to this section`}
              className="ml-2 font-normal text-accent opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
            >
              #
            </a>
          </Tag>
        );
      }
      return (
        <Tag key={key} className="text-fluid-lg font-bold mt-8 mb-3">
          {renderChildren(node, ctx)}
        </Tag>
      );
    }

    case "code_block": {
      const lang = String(node.attrs?.class ?? "").replace(/^language-/, "");
      return (
        <div key={key} className="my-8 overflow-hidden rounded-lg bg-primary text-primary-foreground">
          {/* Badge lives outside the scrollable <pre> so horizontally scrolled
              code never slides underneath it. */}
          {lang && (
            <div className="flex justify-end px-3 pt-2.5">
              <span className="rounded-full bg-primary-foreground/10 px-2.5 py-0.5 font-mono text-xs text-primary-foreground/70">
                {lang}
              </span>
            </div>
          )}
          <pre className={`overflow-x-auto p-4 text-sm leading-relaxed ${lang ? "pt-2" : ""}`}>
            <code className="font-mono">{extractText(node)}</code>
          </pre>
        </div>
      );
    }

    case "blockquote":
      return (
        <blockquote key={key} className="my-8 space-y-4 border-l-4 border-accent pl-6 italic">
          {renderChildren(node, { ...ctx, compact: true })}
        </blockquote>
      );

    case "bullet_list":
      return (
        <ul key={key} className={`mb-6 list-disc space-y-2 pl-6 ${PARAGRAPH_CLASS}`}>
          {renderChildren(node, ctx)}
        </ul>
      );

    case "ordered_list":
      return (
        <ol key={key} className={`mb-6 list-decimal space-y-2 pl-6 ${PARAGRAPH_CLASS}`}>
          {renderChildren(node, ctx)}
        </ol>
      );

    case "list_item":
      return <li key={key}>{renderChildren(node, { ...ctx, compact: true })}</li>;

    case "image": {
      const src = String(node.attrs?.src ?? "");
      if (!src) return null;
      const title = node.attrs?.title ? String(node.attrs.title) : "";
      return (
        <figure key={key} className="my-10">
          <img
            src={storyblokImage(src, 1400)}
            {...(() => {
              const srcSet = storyblokSrcSet(src, [640, 768, 1024, 1280, 1400]);
              // The prose column is `max-w-[70ch]`, which is font-relative and
              // cannot be pinned to a px constant the way the cover's max-w-3xl
              // can. 65ch of the body face measures ~640px, so this is an
              // ESTIMATE that errs slightly large: a too-large `sizes` costs
              // bandwidth, a too-small one costs sharpness.
              return srcSet ? { srcSet, sizes: "(min-width: 688px) 640px, calc(100vw - 48px)" } : {};
            })()}
            {...(() => {
              const size = storyblokImageSize(src);
              return size
                ? { width: 1400, height: Math.round((1400 * size.height) / size.width) }
                : {};
            })()}
            alt={String(node.attrs?.alt ?? "")}
            loading="lazy"
            decoding="async"
            className="w-full max-w-full rounded-lg"
          />
          {title && (
            <figcaption className="mt-3 text-center text-sm text-muted-foreground">{title}</figcaption>
          )}
        </figure>
      );
    }

    case "horizontal_rule":
      return <hr key={key} className="my-12 border-border" />;

    case "hard_break":
      return <br key={key} />;

    case "emoji":
      return <Fragment key={key}>{String(node.attrs?.emoji ?? "")}</Fragment>;

    case "text":
      return renderTextNode(node, key, ctx);

    default:
      // Unknown node type: render its children so content degrades gracefully.
      return node.content?.length ? (
        <Fragment key={key}>{renderChildren(node, ctx)}</Fragment>
      ) : node.text ? (
        renderTextNode(node, key, ctx)
      ) : null;
  }
};

/** Smallest heading level used anywhere in the subtree (Infinity if none). */
const minHeadingLevel = (node: RichtextNode): number => {
  const own = node.type === "heading" ? Number(node.attrs?.level ?? 2) : Infinity;
  return Math.min(own, ...(node.content?.map(minHeadingLevel) ?? []));
};

export const RichText = ({
  document: doc,
  locale,
}: {
  document: RichtextNode | null;
  /**
   * REQUIRED on purpose, with no default. An optional locale would let a new
   * caller forget it and silently render every internal link and the heading
   * anchor label in English, which is precisely the bug this prop exists to fix
   * and is invisible unless someone reads the page in that language.
   */
  locale: string;
}) => {
  if (!doc?.content?.length) return null;
  // The article <h1> comes from the page, so the body's top heading level
  // should be h2. CMS content is often authored at h3. Shift the whole
  // document so its outline never skips from h1 to h3.
  const min = minHeadingLevel(doc);
  const ctx: Ctx = {
    ids: new Map(),
    locale,
    compact: false,
    headingShift: Number.isFinite(min) ? 2 - min : 0,
  };
  return <>{doc.content.map((node, i) => renderNode(node, i, ctx))}</>;
};

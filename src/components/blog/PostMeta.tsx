import { useLocation } from "react-router-dom";
import { Trans } from "@lingui/react/macro";
import { formatDate, postDate, readingTime, toIsoUtc, type BlogPost } from "@/lib/blog";
import { localeFromPath } from "@/i18n/locales";

// Date • reading time • tag chips. Shared between the index cards and the
// article header so the two always agree. Locale comes from the URL prefix
// (works under StaticRouter during prerender and BrowserRouter on the client),
// so dates render in the active language.
export const PostMeta = ({ post }: { post: BlogPost }) => {
  const locale = localeFromPath(useLocation().pathname);
  const date = postDate(post);
  const minutes = readingTime(post.body);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
      {date && (
        <>
          <time dateTime={toIsoUtc(date)}>{formatDate(date, locale)}</time>
          <span aria-hidden="true">•</span>
        </>
      )}
      <span>
        <Trans>{minutes} min read</Trans>
      </span>
      {post.tag_list.length > 0 && (
        <span className="flex flex-wrap gap-2">
          {post.tag_list.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-foreground"
            >
              {tag}
            </span>
          ))}
        </span>
      )}
    </div>
  );
};

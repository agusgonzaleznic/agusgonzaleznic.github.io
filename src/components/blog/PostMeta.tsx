import { formatDate, postDate, readingTime, toIsoUtc, type BlogPost } from "@/lib/blog";

// Date • reading time • tag chips. Shared between the index cards and the
// article header so the two always agree.
export const PostMeta = ({ post }: { post: BlogPost }) => {
  const date = postDate(post);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
      {date && (
        <>
          <time dateTime={toIsoUtc(date)}>{formatDate(date)}</time>
          <span aria-hidden="true">•</span>
        </>
      )}
      <span>{readingTime(post.body)} min read</span>
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

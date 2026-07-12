import { LocaleLink } from "@/components/LocaleLink";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PostMeta } from "@/components/blog/PostMeta";
import type { BlogPost } from "@/lib/blog";

// Static class names so Tailwind's scanner keeps them — a template literal
// like `delay-${n}` is invisible to it and the class gets purged.
const STAGGER_DELAYS = ["", "delay-100", "delay-200", "delay-300", "delay-400"];

export const PostCard = ({ post, index }: { post: BlogPost; index: number }) => (
  <LocaleLink
    to={`/blog/${post.slug}/`}
    className={`group block animate-fade-in-up ${STAGGER_DELAYS[Math.min(index, STAGGER_DELAYS.length - 1)]}`}
  >
    <Card className="h-full border-2 p-6 transition-all duration-300 hover:border-accent/30 hover-lift md:p-8">
      <PostMeta post={post} />
      <h2 className="mt-4 mb-3 text-fluid-xl font-bold leading-snug transition-colors group-hover:text-accent">
        {post.title}
      </h2>
      {post.excerpt && (
        <p className="text-sm leading-relaxed text-muted-foreground">{post.excerpt}</p>
      )}
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
        Read
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </span>
    </Card>
  </LocaleLink>
);

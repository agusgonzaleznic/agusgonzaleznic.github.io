import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useStoryblokApi, StoryblokComponent, useStoryblokState } from "@storyblok/react";
import type { StoryblokStory } from "@/lib/types/storyblok";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { RichText } from "@/components/blog/RichText";
import { storyblokImage, type BlogImage, type RichtextNode } from "@/lib/blog";
import type { PageBlock, PageContent, PagePreviewProps } from "@/lib/pages";
// The real production page wrappers — rendered (fed the draft) so a page
// preview is pixel-identical to the live site instead of the divergent bloks.
import Index from "@/pages/Index";
import About from "@/pages/About";
import Services from "@/pages/Services";
import Impact from "@/pages/Impact";
import Faq from "@/pages/Faq";
import Contact from "@/pages/Contact";
import Philosophy from "@/pages/Philosophy";

interface StoryblokPageProps {
  /** The story's full_slug, e.g. "blog/my-post" or "pages/philosophy". */
  slug?: string;
}

// The blog_post fields the preview reads off the LIVE (bridge-updated) story.
interface BlogPostContent {
  component?: string;
  title?: string;
  body?: RichtextNode | null;
  cover_image?: BlogImage | null;
  published_date?: string;
}

const Shell = ({ children }: { children: ReactNode }) => (
  <>
    <Navigation />
    {children}
    <Footer />
  </>
);

const Centered = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="text-center max-w-md px-6">{children}</div>
  </div>
);

// Render a live blog_post draft with the SAME RichText renderer + article
// container the production /blog/:slug page uses, so the preview matches what
// ships. Page stories render through <StoryblokComponent> (the blok registry)
// instead — see the dispatch in StoryblokPage below.
const BlogPostPreview = ({ content }: { content: BlogPostContent }) => {
  const cover = content.cover_image?.filename ? content.cover_image : null;
  return (
    <main className="pt-16">
      <article className="bg-background">
        <div className="container px-6 py-16 md:py-24">
          <div className="mx-auto max-w-3xl">
            <header className="mb-10">
              <h1 className="mb-6 text-fluid-3xl font-bold leading-tight">{content.title}</h1>
              {content.published_date && (
                <p className="text-sm text-muted-foreground">{content.published_date}</p>
              )}
            </header>
            {cover && (
              <figure className="mb-12">
                <img
                  src={storyblokImage(cover.filename, 1536)}
                  alt={cover.alt || content.title || ""}
                  className="w-full max-w-full rounded-lg"
                />
              </figure>
            )}
            <div className="max-w-[70ch]">
              <RichText document={content.body ?? null} />
            </div>
          </div>
        </div>
      </article>
    </main>
  );
};

// story.slug → the real production page component. Rendered with the draft as
// previewContent, so a page preview matches prod exactly (no divergent bloks).
const PAGE_WRAPPERS: Record<string, ComponentType<PagePreviewProps>> = {
  home: Index,
  about: About,
  services: Services,
  impact: Impact,
  faq: Faq,
  contact: Contact,
  philosophy: Philosophy,
};

// Map a live (bridge-updated) `page` story to the PageContent shape the real
// wrappers read via getPageContent — mirrors mapPage in scripts/lib.
const pageContentFromStory = (story: StoryblokStory): PageContent => {
  const c = story.content as unknown as {
    seo_title?: string;
    seo_description?: string;
    og_image?: { filename?: string } | null;
    body?: PageBlock[];
  };
  return {
    slug: story.slug,
    seo_title: c.seo_title ?? "",
    seo_description: c.seo_description ?? "",
    og_image: c.og_image?.filename ?? "",
    blocks: Array.isArray(c.body) ? c.body : [],
  };
};

/**
 * Storyblok Visual Editor preview host (dev-only; excluded from prerender).
 *
 * The Visual Editor loads {preview URL}/{story.full_slug} in an iframe — with
 * the Dev environment set to https://localhost:8080/preview/, that becomes
 * /preview/blog/<slug> or /preview/pages/<slug>. The App route captures the
 * full_slug (splat) and passes it here. We fetch the DRAFT once for the first
 * paint, then useStoryblokState subscribes to the bridge for live edits, and
 * dispatch by content type: blog_post → the blog article render, everything
 * else → the registered blok components.
 *
 * Requires VITE_STORYBLOK_ACCESS_TOKEN (a draft-capable preview token) in
 * .env.development.local — loaded by `vite` in dev, never by a prod build.
 */
export const StoryblokPage = ({ slug = "home" }: StoryblokPageProps) => {
  const [initialStory, setInitialStory] = useState<StoryblokStory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const storyblokApi = useStoryblokApi();

  useEffect(() => {
    let cancelled = false;
    const fetchStory = async () => {
      if (!storyblokApi) {
        setError(
          "Storyblok is disabled. Set VITE_STORYBLOK_ACCESS_TOKEN in .env.development.local, then restart the dev server.",
        );
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const { data } = await storyblokApi.get(`cdn/stories/${slug}`, { version: "draft" });
        if (!cancelled) {
          setInitialStory(data.story);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError(`Couldn't load draft "${slug}". Check the slug and that the token can read drafts.`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchStory();
    return () => {
      cancelled = true;
    };
  }, [slug, storyblokApi]);

  // Bridge: live updates as content is edited in the Visual Editor.
  const story = useStoryblokState(initialStory);

  if (loading) {
    return (
      <Centered>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4" />
        <p className="text-muted-foreground">Loading draft from Storyblok…</p>
      </Centered>
    );
  }

  if (error || !story) {
    return (
      <Centered>
        <h1 className="text-2xl font-bold mb-4">Preview unavailable</h1>
        <p className="text-muted-foreground mb-6">{error || "The requested story could not be loaded."}</p>
        <a href="/" className="text-accent hover:underline font-medium">
          Return to homepage
        </a>
      </Centered>
    );
  }

  const component = (story.content as unknown as { component?: string })?.component;

  if (component === "blog_post") {
    return (
      <Shell>
        <BlogPostPreview content={story.content as unknown as BlogPostContent} />
      </Shell>
    );
  }

  if (component === "page") {
    const pageContent = pageContentFromStory(story as unknown as StoryblokStory);
    const Wrapper = PAGE_WRAPPERS[pageContent.slug];
    // Real wrappers render their own Navigation/Footer (via SeoPage), so no
    // <Shell> here — this is the exact production page fed the live draft.
    if (Wrapper) return <Wrapper previewContent={pageContent} />;
  }

  // Unknown component, or a page slug with no wrapper: fall back to the blok
  // registry so something still renders.
  return (
    <Shell>
      <StoryblokComponent blok={story.content} />
    </Shell>
  );
};

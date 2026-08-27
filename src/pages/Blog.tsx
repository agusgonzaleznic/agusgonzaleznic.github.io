import { useLocation } from "react-router-dom";
import { Trans, useLingui } from "@lingui/react/macro";
import { SeoPage } from "@/components/SeoPage";
import { PostCard } from "@/components/blog/PostCard";
import { getAllPosts } from "@/lib/blog";
import { SITE_URL } from "@/lib/site";
import { localeFromPath } from "@/i18n/locales";
import { SECTION_HEADER_MARGIN, SECTION_PADDING } from "@/lib/layout";

const Blog = () => {
  const { t } = useLingui();
  // Locale is derived from the URL prefix (matches what prerender activates and
  // what the client activates before hydrate). English (root) is unchanged:
  // localizePath("/blog/", "en") === "/blog/".
  const locale = localeFromPath(useLocation().pathname);
  const posts = getAllPosts(locale);

  const title = t`Writing | Agustin Gonzalez Nicolini`;
  const description = t`Notes on engineering leadership and the systems behind it, from fifteen years of running teams and infrastructure. By Agustin Gonzalez Nicolini.`;

  return (
    // Was a hand-rolled <Helmet> with title/description/canonical/og:type/
    // og:title/og:description/og:url/og:locale and the RSS link, i.e. no
    // og:image, no twitter card, no og:site_name and no JSON-LD, so this page
    // unfurled as a bare link on every social and chat surface. SeoPage supplies
    // all of that (plus WebPage + BreadcrumbList + Person/WebSite nodes) and
    // localizes the canonical exactly as before. The DOM below <main> is
    // unchanged, deliberately: SeoPage's shell is already
    // div.min-h-screen > Navigation + main.pt-16 + Footer.
    <SeoPage
      path="/blog/"
      title={title}
      description={description}
      crumb={t`Writing`}
      pageType="Blog"
      extraHead={
        <link
          rel="alternate"
          type="application/rss+xml"
          title={t`Writing | Agustin Gonzalez Nicolini`}
          href={`${SITE_URL}/blog/rss.xml`}
        />
      }
    >
        <section className="bg-background">
          <div className={`container px-6 ${SECTION_PADDING}`}>
            <div className="mx-auto max-w-3xl">
              <header className={`${SECTION_HEADER_MARGIN} animate-fade-in-up`}>
                <h1 className="mb-4 text-fluid-3xl font-bold"><Trans>Writing</Trans></h1>
                <p className="text-fluid-lg leading-relaxed text-muted-foreground">
                  <Trans>Notes from fifteen years of running engineering teams: leadership,
                  infrastructure, and the occasional strong opinion. I publish when I
                  have something worth saying, not on a schedule.</Trans>
                </p>
              </header>

              {posts.length === 0 ? (
                <div className="rounded-lg border-2 border-dashed border-border p-12 text-center animate-fade-in-up">
                  <p className="text-fluid-lg font-serif font-bold text-foreground">
                    <Trans>Nothing here yet</Trans>
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    <Trans>The first posts are on their way. Check back soon.</Trans>
                  </p>
                </div>
              ) : (
                <div className="grid gap-6">
                  {posts.map((post, index) => (
                    <PostCard key={post.slug} post={post} index={index} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
    </SeoPage>
  );
};

export default Blog;

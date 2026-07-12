import { Helmet } from "react-helmet";
import { useLocation } from "react-router-dom";
import { Trans, useLingui } from "@lingui/react/macro";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { PostCard } from "@/components/blog/PostCard";
import { getAllPosts, SITE_URL } from "@/lib/blog";
import { localeFromPath, localizePath } from "@/i18n/locales";
import { SECTION_HEADER_MARGIN, SECTION_PADDING } from "@/lib/layout";

const Blog = () => {
  const { t } = useLingui();
  // Locale is derived from the URL prefix (matches what prerender activates and
  // what the client activates before hydrate). English (root) is unchanged:
  // localizePath("/blog/", "en") === "/blog/".
  const locale = localeFromPath(useLocation().pathname);
  const posts = getAllPosts(locale);
  const blogUrl = `${SITE_URL}${localizePath("/blog/", locale)}`;

  const title = t`Writing | Agustin Gonzalez Nicolini`;
  const description = t`Notes on engineering leadership and the systems behind it, from fifteen years of running teams and infrastructure. By Agustin Gonzalez Nicolini.`;

  return (
    <div className="min-h-screen">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={blogUrl} />
        <link
          rel="alternate"
          type="application/rss+xml"
          title={t`Writing — Agustin Gonzalez Nicolini`}
          href={`${SITE_URL}/blog/rss.xml`}
        />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={blogUrl} />
      </Helmet>
      <Navigation />
      <main className="pt-16">
        <section className="bg-background">
          <div className={`container px-6 ${SECTION_PADDING}`}>
            <div className="mx-auto max-w-3xl">
              <header className={`${SECTION_HEADER_MARGIN} animate-fade-in-up`}>
                <h1 className="mb-4 text-fluid-3xl font-bold"><Trans>Writing</Trans></h1>
                <p className="text-fluid-lg leading-relaxed text-muted-foreground">
                  <Trans>Notes from fifteen years of running engineering teams — leadership,
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
      </main>
      <Footer />
    </div>
  );
};

export default Blog;

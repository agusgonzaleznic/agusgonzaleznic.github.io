import { Helmet } from "react-helmet";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { PostCard } from "@/components/blog/PostCard";
import { getAllPosts, SITE_URL } from "@/lib/blog";
import { SECTION_HEADER_MARGIN, SECTION_PADDING } from "@/lib/layout";

const TITLE = "Writing | Agustin Gonzalez Nicolini";
const DESCRIPTION =
  "Notes on engineering leadership and the systems behind it, from fifteen years of running teams and infrastructure. By Agustin Gonzalez Nicolini.";

const Blog = () => {
  const posts = getAllPosts();

  return (
    <div className="min-h-screen">
      <Helmet>
        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        <link rel="canonical" href={`${SITE_URL}/blog/`} />
        <link
          rel="alternate"
          type="application/rss+xml"
          title="Writing — Agustin Gonzalez Nicolini"
          href={`${SITE_URL}/blog/rss.xml`}
        />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:url" content={`${SITE_URL}/blog/`} />
      </Helmet>
      <Navigation />
      <main className="pt-16">
        <section className="bg-background">
          <div className={`container px-6 ${SECTION_PADDING}`}>
            <div className="mx-auto max-w-3xl">
              <header className={`${SECTION_HEADER_MARGIN} animate-fade-in-up`}>
                <h1 className="mb-4 text-fluid-3xl font-bold">Writing</h1>
                <p className="text-fluid-lg leading-relaxed text-muted-foreground">
                  Notes from fifteen years of running engineering teams — leadership,
                  infrastructure, and the occasional strong opinion. I publish when I
                  have something worth saying, not on a schedule.
                </p>
              </header>

              {posts.length === 0 ? (
                <div className="rounded-lg border-2 border-dashed border-border p-12 text-center animate-fade-in-up">
                  <p className="text-fluid-lg font-serif font-bold text-foreground">
                    Nothing here yet
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    The first posts are on their way. Check back soon.
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

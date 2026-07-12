import { useEffect } from "react";
import { Helmet } from "react-helmet";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Trans } from "@lingui/react/macro";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { PostMeta } from "@/components/blog/PostMeta";
import { RichText } from "@/components/blog/RichText";
import NotFound from "@/pages/NotFound";
import {
  getPost,
  postDate,
  postUrl,
  SITE_URL,
  storyblokImage,
  toIsoUtc,
} from "@/lib/blog";
import { localeFromPath, localizePath, SOURCE_LOCALE } from "@/i18n/locales";
import { SECTION_PADDING } from "@/lib/layout";

const AUTHOR = "Agustin Gonzalez Nicolini";

// react-helmet emits <script> children as raw innerHTML (attributes are the
// only thing it escapes), so `</script>` inside a CMS string would break out
// of the JSON-LD block in the prerendered HTML. `<` is valid JSON and
// renders identically, so escape every `<` before embedding.
const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

const BlogPostPage = () => {
  const { slug = "" } = useParams<{ slug: string }>();
  // Locale from the URL prefix; drives per-locale post data + localized self
  // URLs. English (root) is unchanged: localizePath(p, "en") === p.
  const locale = localeFromPath(useLocation().pathname);
  const post = getPost(slug, locale);

  // React Router keeps the scroll position on client-side navigation.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  if (!post) return <NotFound />;

  const abs = (path: string) => `${SITE_URL}${localizePath(path, locale)}`;
  // JSON-LD inLanguage is only emitted for prefixed locales so the English
  // output stays byte-identical to before i18n.
  const langLd = locale !== SOURCE_LOCALE ? { inLanguage: locale } : {};

  const title = post.seo_title || post.title;
  const description = post.seo_description || post.excerpt;
  // canonical_override is CMS-editable: only accept https URLs so an editor
  // can't point canonical/og:url/JSON-LD @id at javascript:/data: or http.
  // Otherwise the canonical is this post's localized self URL.
  const canonical = /^https:\/\//.test(post.canonical_override)
    ? post.canonical_override
    : locale === SOURCE_LOCALE
      ? postUrl(post.slug)
      : abs(`/blog/${post.slug}/`);
  const published = toIsoUtc(postDate(post));
  const ogImage = post.cover_image
    ? storyblokImage(post.cover_image.filename, 1200, 630)
    : `${SITE_URL}/og-image.jpg`;

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    ...langLd,
    headline: post.title,
    image: [ogImage],
    datePublished: published,
    dateModified: toIsoUtc(post.published_at) || published,
    author: [{ "@type": "Person", name: AUTHOR, url: abs("/") }],
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    ...langLd,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: abs("/") },
      { "@type": "ListItem", position: 2, name: "Writing", item: abs("/blog/") },
      { "@type": "ListItem", position: 3, name: post.title },
    ],
  };

  return (
    <div className="min-h-screen">
      <Helmet>
        <title>{`${title} | ${AUTHOR}`}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={ogImage} />
        <meta property="article:published_time" content={published} />
        {post.tag_list.map((tag) => (
          <meta key={tag} property="article:tag" content={tag} />
        ))}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImage} />
        <script type="application/ld+json">{jsonLd(articleLd)}</script>
        <script type="application/ld+json">{jsonLd(breadcrumbLd)}</script>
      </Helmet>
      <Navigation />
      <main className="pt-16">
        <article className="bg-background">
          <div className={`container px-6 ${SECTION_PADDING}`}>
            <div className="mx-auto max-w-3xl">
              <header className="mb-10 animate-fade-in-up">
                <Link
                  to="/blog/"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-accent"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <Trans>All writing</Trans>
                </Link>
                <h1 className="mt-8 mb-6 text-fluid-3xl font-bold leading-tight">
                  {post.title}
                </h1>
                <PostMeta post={post} />
                {post.original_url && (
                  <p className="mt-4 text-sm italic text-muted-foreground">
                    <Trans>
                      Originally published on{" "}
                      <a
                        href={post.original_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent underline-offset-4 hover:underline"
                      >
                        Medium
                      </a>
                      .
                    </Trans>
                  </p>
                )}
              </header>

              {post.cover_image && (
                <figure className="mb-12 animate-fade-in">
                  <img
                    src={storyblokImage(post.cover_image.filename, 1536)}
                    alt={post.cover_image.alt || post.title}
                    // LCP candidate: load eagerly (React 18 only forwards the
                    // lowercase spelling of fetchpriority).
                    loading="eager"
                    {...({ fetchpriority: "high" } as Record<string, string>)}
                    className="w-full max-w-full rounded-lg"
                  />
                  {post.cover_image.title && (
                    <figcaption className="mt-3 text-center text-sm text-muted-foreground">
                      {post.cover_image.title}
                    </figcaption>
                  )}
                </figure>
              )}

              <div className="max-w-[70ch]">
                <RichText document={post.body} />
              </div>
            </div>
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
};

export default BlogPostPage;

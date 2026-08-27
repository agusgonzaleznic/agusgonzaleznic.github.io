import { useEffect } from "react";
import { Helmet } from "react-helmet";
import { useLocation, useParams } from "react-router-dom";
import profileImage from "@/assets/profile.jpg";
import { LocaleLink } from "@/components/LocaleLink";
import { ArrowLeft } from "lucide-react";
import { Trans } from "@lingui/react/macro";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { PostMeta } from "@/components/blog/PostMeta";
import { MachineTranslationNotice } from "@/components/blog/MachineTranslationNotice";
import { RichText } from "@/components/blog/RichText";
import NotFound from "@/pages/NotFound";
import {
  getPost,
  postCorpusLocale,
  postDate,
  postUrl,
  toIsoUtc,
} from "@/lib/blog";
import { storyblokImage } from "@/lib/richtext";
import { getPostBody } from "@/lib/blog-body";
import { CoverImage } from "@/components/blog/CoverImage";
import { SITE_URL } from "@/lib/site";
import { LocaleLinksContext } from "@/i18n/locale-links";
import {
  isAutoTranslated,
  localeFromPath,
  localizePath,
  LOCALE_META,
  SOURCE_LOCALE,
} from "@/i18n/locales";
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
  // The body lives in a separate per-locale file (blog-body.<locale>.json) so the
  // /blog index does not ship six locales of article text. It MUST be keyed off
  // the corpus getPost actually resolved in, not off `locale`: getPost falls back
  // to the English article when a locale has no approved variant, and a lookup on
  // the requested locale would then find nothing and render an empty article.
  const body = getPostBody(slug, postCorpusLocale(slug, locale));

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
    // The switcher lives in Navigation/Footer and cannot know which locales this
    // article was approved for, so the article tells it. Locales without a
    // variant fall back to the blog index in that language rather than to a URL
    // prerender never emitted. `approved_locales` is the same array that drives
    // prerender's emission loop and the hreflang set in this very <head>, so the
    // body links and the head alternates can no longer disagree.
    <LocaleLinksContext.Provider
      value={{ locales: post.approved_locales, fallbackPath: "/blog/" }}
    >
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
        <meta property="og:locale" content={LOCALE_META[locale].ogLocale} />
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
                <LocaleLink
                  to="/blog/"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-accent"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <Trans>All writing</Trans>
                </LocaleLink>
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

              {/* Disclose machine translation on FR/IT/PT articles; link the
                  English original (root path). DE/ES are human-gated → no notice. */}
              {isAutoTranslated(locale) && (
                <MachineTranslationNotice enUrl={`/blog/${post.slug}/`} />
              )}

              {post.cover_image && (
                <figure className="mb-12 animate-fade-in">
                  <CoverImage image={post.cover_image} fallbackAlt={post.title} priority />
                  {post.cover_image.title && (
                    <figcaption className="mt-3 text-center text-sm text-muted-foreground">
                      {post.cover_image.title}
                    </figcaption>
                  )}
                </figure>
              )}

              <div className="max-w-[70ch]">
                <RichText document={body} />
              </div>

              {/* Author box: every post links back to the coaching pages
                  (locale-aware, descriptive anchors shared with RelatedPages). */}
              <div className="mt-16 border-t border-border pt-8">
                <div className="flex items-start gap-4">
                  <img
                    src={profileImage}
                    alt=""
                    width="56"
                    height="56"
                    loading="lazy"
                    className="w-14 h-14 rounded-full object-cover shrink-0"
                  />
                  <div>
                    <p className="font-medium text-foreground">
                      <Trans>I'm Agustin: I coach engineering leaders, from first-time managers to CTOs.</Trans>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                      <LocaleLink
                        to="/about"
                        className="text-accent underline-offset-4 hover:underline"
                      >
                        <Trans>My story, from Haedo to Berlin</Trans>
                      </LocaleLink>
                      <LocaleLink
                        to="/services"
                        className="text-accent underline-offset-4 hover:underline"
                      >
                        <Trans>Coaching formats for CTOs, VPs, and engineering managers</Trans>
                      </LocaleLink>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </article>
      </main>
      <Footer />
    </div>
    </LocaleLinksContext.Provider>
  );
};

export default BlogPostPage;

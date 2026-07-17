import type { ReactNode } from "react";
import { Helmet } from "react-helmet";
import { useLocation } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { SITE_URL } from "@/lib/blog";
import { localeFromPath, localizePath, LOCALE_META, SOURCE_LOCALE } from "@/i18n/locales";

// react-helmet emits <script> children as raw innerHTML (it only escapes
// attributes), so an unescaped "<" inside a JSON-LD string could break out of
// the block in the prerendered HTML. "<" is valid JSON and renders identically,
// so escape every "<" before embedding. Same helper as BlogPost.tsx.
const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

type SeoPageProps = {
  /** English (root) canonical path, e.g. "/about". localizePath adds the prefix. */
  path: string;
  /** Full <title> string (already includes any brand suffix). */
  title: string;
  /** Meta description. */
  description: string;
  /** Breadcrumb name for this page (Home is prepended). English, like BlogPost. */
  crumb: string;
  /** schema.org page type for the auto WebPage node (AboutPage, ContactPage, …). */
  pageType?: string;
  /** Optional entity this page is primarily about (e.g. { "@id": …#person }). */
  about?: Record<string, unknown>;
  /** Extra JSON-LD nodes (FAQPage, ProfessionalService) emitted verbatim. */
  extraSchema?: Record<string, unknown>[];
  children: ReactNode;
};

// Shared shell for the marketing section pages (About, Philosophy, Services,
// Impact, FAQ, Contact). Mirrors Blog.tsx (Navigation + Helmet + <main> +
// Footer) but centralizes the locale-aware head: self canonical (localized so
// the prerender's prefixed-locale canonical guard passes), og/twitter tags, and
// JSON-LD (BreadcrumbList + a WebPage node + any page-specific nodes). Client
// navigation between these swaps content in place with no reload — same
// mechanism as the existing Home↔Blog nav.
export const SeoPage = ({
  path,
  title,
  description,
  crumb,
  pageType = "WebPage",
  about,
  extraSchema = [],
  children,
}: SeoPageProps) => {
  // Locale from the URL prefix — drives localized self URLs + og:locale. English
  // (root) is unchanged: localizePath(p, "en") === p.
  const locale = localeFromPath(useLocation().pathname);
  const abs = (p: string) => `${SITE_URL}${localizePath(p, locale)}`;
  const canonical = abs(path);
  // og:image banner (same asset the home page ships). WebP first for modern
  // clients + a JPEG fallback for unfurlers that don't render WebP (WhatsApp,
  // legacy LinkedIn). The alt describes the banner, so it's the same everywhere.
  const ogImageWebp = `${SITE_URL}/og-image.webp`;
  const ogImageJpg = `${SITE_URL}/og-image.jpg`;
  const ogAlt = "Agustin Gonzalez Nicolini — Engineering Leadership Coach";
  // Only claim a language on prefixed locales (keeps English output stable).
  const langLd = locale !== SOURCE_LOCALE ? { inLanguage: locale } : {};

  const webPageLd = {
    "@context": "https://schema.org",
    "@type": pageType,
    "@id": `${canonical}#webpage`,
    url: canonical,
    name: title,
    description,
    ...langLd,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    ...(about ? { about, mainEntity: about } : {}),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    ...langLd,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: abs("/") },
      { "@type": "ListItem", position: 2, name: crumb, item: canonical },
    ],
  };

  return (
    <div className="min-h-screen">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={ogImageWebp} />
        <meta property="og:image:type" content="image/webp" />
        <meta property="og:image:width" content="1500" />
        <meta property="og:image:height" content="500" />
        <meta property="og:image:alt" content={ogAlt} />
        <meta property="og:image" content={ogImageJpg} />
        <meta property="og:image:type" content="image/jpeg" />
        <meta property="og:locale" content={LOCALE_META[locale].ogLocale} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImageWebp} />
        <meta name="twitter:image:alt" content={ogAlt} />
        <script type="application/ld+json">{jsonLd(webPageLd)}</script>
        <script type="application/ld+json">{jsonLd(breadcrumbLd)}</script>
        {extraSchema.map((node, i) => (
          <script key={i} type="application/ld+json">
            {jsonLd(node)}
          </script>
        ))}
      </Helmet>
      <Navigation />
      <main className="pt-16">{children}</main>
      <Footer />
    </div>
  );
};

import { useLocation } from "react-router-dom";
import { useLingui } from "@lingui/react/macro";
import { SeoPage } from "@/components/SeoPage";
import { Links, type LinksBlock } from "@/components/Links";
import { SITE_URL } from "@/lib/blog";
import { getPageContent, getBlock, type PagePreviewProps } from "@/lib/pages";
import { localeFromPath } from "@/i18n/locales";

// The "linktree" page (/links). CMS-managed via the pages/links Storyblok story
// (a `page` with one links_block). Standalone/minimal — chrome={false} drops the
// site nav + footer — but the SEO/GEO head is fully applied: a ProfilePage node
// about the Person, whose identity links (is_profile) enrich the Person's sameAs.
const LinksPage = ({ previewContent }: PagePreviewProps) => {
  const { t } = useLingui();
  const locale = localeFromPath(useLocation().pathname);
  const content = previewContent ?? getPageContent("links", locale);
  const block = getBlock<LinksBlock>(content, "links_block");
  // sameAs (GEO): the CMS links flagged as identity profiles. SeoPage unions
  // these with its baseline (LinkedIn + GitHub) and dedupes.
  const sameAs = (block?.links ?? [])
    .filter((l) => l?.is_profile && /^https?:/i.test(l.url ?? ""))
    .map((l) => l.url as string);

  return (
    <SeoPage
      path="/links"
      chrome={false}
      pageType="ProfilePage"
      ogImage={content?.og_image}
      title={content?.seo_title || t`Links & Profiles — Agustin Gonzalez Nicolini`}
      description={
        content?.seo_description ||
        t`All my links in one place: LinkedIn, GitHub, my blog, Medium, and how to book an intro call.`
      }
      crumb={t`Links`}
      about={{ "@id": `${SITE_URL}/#person` }}
      sameAs={sameAs}
    >
      <Links block={block} />
    </SeoPage>
  );
};

export default LinksPage;

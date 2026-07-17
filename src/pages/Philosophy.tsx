import { useLocation } from "react-router-dom";
import { useLingui } from "@lingui/react/macro";
import { SeoPage } from "@/components/SeoPage";
import { Philosophy, type PhilosophyBlock } from "@/components/Philosophy";
import { HowIWork, type HowIWorkBlock } from "@/components/HowIWork";
import { RelatedPages } from "@/components/RelatedPages";
import { SITE_URL } from "@/lib/blog";
import { getPageContent, getBlock } from "@/lib/pages";
import { localeFromPath } from "@/i18n/locales";

const PhilosophyPage = () => {
  const { t } = useLingui();
  // CMS content for the active locale (null → components render their fallback).
  const locale = localeFromPath(useLocation().pathname);
  const content = getPageContent("philosophy", locale);
  const philosophyBlock = getBlock<PhilosophyBlock>(content, "philosophy_block");
  const howIWorkBlock = getBlock<HowIWorkBlock>(content, "how_i_work_block");

  return (
    <SeoPage
      path="/philosophy"
      ogImage={content?.og_image}
      title={content?.seo_title || t`Engineering Leadership Coaching Philosophy`}
      description={
        content?.seo_description ||
        t`How I coach engineering leaders: clarity over noise, systems over heroics, and empathy that scales. The principles behind every session.`
      }
      crumb={t`Philosophy`}
      about={{ "@id": `${SITE_URL}/#person` }}
    >
      <Philosophy block={philosophyBlock} />
      <HowIWork block={howIWorkBlock} />
      <RelatedPages page="philosophy" />
    </SeoPage>
  );
};

export default PhilosophyPage;

import { useLocation } from "react-router-dom";
import { useLingui } from "@lingui/react/macro";
import { SeoPage } from "@/components/SeoPage";
import { Impact, type ImpactBlock } from "@/components/Impact";
import { RelatedPages } from "@/components/RelatedPages";
import { SITE_URL } from "@/lib/blog";
import { getPageContent, getBlock } from "@/lib/pages";
import { localeFromPath } from "@/i18n/locales";

const ImpactPage = () => {
  const { t } = useLingui();
  const locale = localeFromPath(useLocation().pathname);
  const content = getPageContent("impact", locale);
  const impactBlock = getBlock<ImpactBlock>(content, "impact_block");

  return (
    <SeoPage
      path="/impact"
      ogImage={content?.og_image}
      title={content?.seo_title || t`Experience & Impact — Engineering Leadership Coaching`}
      description={
        content?.seo_description ||
        t`My track record leading engineering orgs — and the results coaching delivers: faster delivery, lower attrition, and teams that run without heroics.`
      }
      crumb={t`Impact`}
      about={{ "@id": `${SITE_URL}/#person` }}
    >
      <Impact block={impactBlock} />
      <RelatedPages page="impact" />
    </SeoPage>
  );
};

export default ImpactPage;

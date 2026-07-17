import { useLocation } from "react-router-dom";
import { useLingui } from "@lingui/react/macro";
import { SeoPage } from "@/components/SeoPage";
import { About, type AboutBlock } from "@/components/About";
import { RelatedPages } from "@/components/RelatedPages";
import { SITE_URL } from "@/lib/blog";
import { getPageContent, getBlock } from "@/lib/pages";
import { localeFromPath } from "@/i18n/locales";

const AboutPage = () => {
  const { t } = useLingui();
  const locale = localeFromPath(useLocation().pathname);
  const content = getPageContent("about", locale);
  const aboutBlock = getBlock<AboutBlock>(content, "about_block");

  return (
    <SeoPage
      path="/about"
      ogImage={content?.og_image}
      title={content?.seo_title || t`About Agustin Gonzalez Nicolini — Engineering Leadership Coach`}
      description={
        content?.seo_description ||
        t`Meet Agustin Gonzalez Nicolini — engineering leader turned coach in Berlin. 15+ years scaling teams across fintech, gaming, e-mobility, and Web3.`
      }
      crumb={t`About`}
      pageType="AboutPage"
      about={{ "@id": `${SITE_URL}/#person` }}
    >
      <About block={aboutBlock} />
      <RelatedPages page="about" />
    </SeoPage>
  );
};

export default AboutPage;

import { useLingui } from "@lingui/react/macro";
import { SeoPage } from "@/components/SeoPage";
import { About } from "@/components/About";
import { RelatedPages } from "@/components/RelatedPages";
import { SITE_URL } from "@/lib/blog";

const AboutPage = () => {
  const { t } = useLingui();
  return (
    <SeoPage
      path="/about"
      title={t`About Agustin Gonzalez Nicolini — Engineering Leadership Coach`}
      description={t`Meet Agustin Gonzalez Nicolini — engineering leader turned coach in Berlin. 15+ years scaling teams across fintech, gaming, e-mobility, and Web3.`}
      crumb={t`About`}
      pageType="AboutPage"
      about={{ "@id": `${SITE_URL}/#person` }}
    >
      <About />
      <RelatedPages page="about" />
    </SeoPage>
  );
};

export default AboutPage;

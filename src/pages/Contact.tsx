import { useLingui } from "@lingui/react/macro";
import { SeoPage } from "@/components/SeoPage";
import { Contact } from "@/components/Contact";
import { RelatedPages } from "@/components/RelatedPages";
import { SITE_URL } from "@/lib/blog";

const ContactPage = () => {
  const { t } = useLingui();
  return (
    <SeoPage
      path="/contact"
      title={t`Contact & Book a Session — Engineering Leadership Coaching`}
      description={t`Book a free 30-minute intro call with Agustin Gonzalez Nicolini, or email me. Remote coaching for engineering leaders worldwide, in EN, ES, and DE.`}
      crumb={t`Contact`}
      pageType="ContactPage"
      about={{ "@id": `${SITE_URL}/#person` }}
    >
      <Contact />
      <RelatedPages page="contact" />
    </SeoPage>
  );
};

export default ContactPage;

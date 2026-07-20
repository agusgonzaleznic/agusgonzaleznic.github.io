import { useLocation } from "react-router-dom";
import { useLingui } from "@lingui/react/macro";
import { SeoPage } from "@/components/SeoPage";
import { Contact, type ContactBlock } from "@/components/Contact";
import { RelatedPages } from "@/components/RelatedPages";
import { SITE_URL } from "@/lib/blog";
import { getPageContent, getBlock, type PagePreviewProps } from "@/lib/pages";
import { localeFromPath } from "@/i18n/locales";

const ContactPage = ({ previewContent }: PagePreviewProps) => {
  const { t } = useLingui();
  const locale = localeFromPath(useLocation().pathname);
  const content = previewContent ?? getPageContent("contact", locale);
  const contactBlock = getBlock<ContactBlock>(content, "contact_block");

  return (
    <SeoPage
      path="/contact"
      ogImage={content?.og_image}
      title={content?.seo_title || t`Contact & Book a Session — Engineering Leadership Coaching`}
      description={
        content?.seo_description ||
        t`Book a free 30-minute intro call with Agustin Gonzalez Nicolini, or email me. Remote coaching for engineering leaders worldwide, in EN, ES, and DE.`
      }
      crumb={t`Contact`}
      pageType="ContactPage"
      about={{ "@id": `${SITE_URL}/#person` }}
    >
      <Contact block={contactBlock} />
      <RelatedPages page="contact" />
    </SeoPage>
  );
};

export default ContactPage;

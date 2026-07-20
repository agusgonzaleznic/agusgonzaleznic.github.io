import { useLocation } from "react-router-dom";
import { useLingui } from "@lingui/react/macro";
import { SeoPage } from "@/components/SeoPage";
import { FAQ } from "@/components/FAQ";
import { resolveFaqs, type FaqBlock } from "@/lib/faq-data";
import { RelatedPages } from "@/components/RelatedPages";
import { SITE_URL } from "@/lib/blog";
import { getPageContent, getBlock, type PagePreviewProps } from "@/lib/pages";
import { localeFromPath } from "@/i18n/locales";

const FaqPage = ({ previewContent }: PagePreviewProps) => {
  const { t, i18n } = useLingui();
  const locale = localeFromPath(useLocation().pathname);
  const content = previewContent ?? getPageContent("faq", locale);
  const faqBlock = getBlock<FaqBlock>(content, "faq_block");

  // FAQPage schema built from the SAME resolved Q&A the accordion renders (CMS
  // block or hardcoded fallback), so the structured data matches the visible
  // answers in the active locale — no cloaking. @id stays the site-global id.
  const faqPageLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${SITE_URL}/#faq`,
    mainEntity: resolveFaqs(faqBlock, i18n).map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  return (
    <SeoPage
      path="/faq"
      ogImage={content?.og_image}
      title={content?.seo_title || t`Engineering Leadership Coaching FAQ — Agustin Gonzalez Nicolini`}
      description={
        content?.seo_description ||
        t`Answers on engineering leadership coaching — who I work with, what sessions cover, remote coaching, languages, and how to get started.`
      }
      crumb={t`FAQ`}
      about={{ "@id": `${SITE_URL}/#faq` }}
      extraSchema={[faqPageLd]}
    >
      <FAQ block={faqBlock} />
      <RelatedPages page="faq" />
    </SeoPage>
  );
};

export default FaqPage;

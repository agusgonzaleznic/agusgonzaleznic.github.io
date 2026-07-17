import { useLingui } from "@lingui/react/macro";
import { SeoPage } from "@/components/SeoPage";
import { FAQ } from "@/components/FAQ";
import { faqs } from "@/lib/faq-data";
import { SITE_URL } from "@/lib/blog";

const FaqPage = () => {
  const { t, i18n } = useLingui();

  // FAQPage schema, built from the SAME msg`` catalog strings the accordion
  // renders (via i18n._), so the structured data matches the visible Q&A in the
  // active locale — no cloaking. Relocated here from index.html's @graph (the
  // FAQ content now lives on this page); @id stays the site-global entity id.
  const faqPageLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${SITE_URL}/#faq`,
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: i18n._(f.question),
      acceptedAnswer: { "@type": "Answer", text: i18n._(f.answer) },
    })),
  };

  return (
    <SeoPage
      path="/faq"
      title={t`Engineering Leadership Coaching FAQ — Agustin Gonzalez Nicolini`}
      description={t`Answers on engineering leadership coaching — who I work with, what sessions cover, remote coaching, languages, and how to get started.`}
      crumb="FAQ"
      extraSchema={[faqPageLd]}
    >
      <FAQ />
    </SeoPage>
  );
};

export default FaqPage;

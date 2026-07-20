import { useLocation } from "react-router-dom";
import { useLingui } from "@lingui/react/macro";
import { SeoPage } from "@/components/SeoPage";
import { Services, type ServicesBlock } from "@/components/Services";
import { Testimonials, type TestimonialsBlock } from "@/components/Testimonials";
import { RelatedPages } from "@/components/RelatedPages";
import { SITE_URL } from "@/lib/blog";
import { getPageContent, getBlock, type PagePreviewProps } from "@/lib/pages";
import { localeFromPath, localizePath, SOURCE_LOCALE } from "@/i18n/locales";

const ServicesPage = ({ previewContent }: PagePreviewProps) => {
  const { t } = useLingui();
  const locale = localeFromPath(useLocation().pathname);
  const content = previewContent ?? getPageContent("services", locale);
  const servicesBlock = getBlock<ServicesBlock>(content, "services_block");
  const testimonialsBlock = getBlock<TestimonialsBlock>(content, "testimonials_block");

  const title = content?.seo_title || t`Engineering Leadership Coaching — CTO, VP & Manager`;
  const description =
    content?.seo_description ||
    t`One-on-one coaching for CTOs, VPs, directors, and engineering managers — executive coaching, delivery and team coaching, and IC-to-manager programs.`;

  // ProfessionalService + offer catalog. The @id stays the site-global entity id
  // so every locale page's copy merges into ONE entity; description reuses the
  // page's meta-description (CMS-sourced, translated), url points at the locale
  // services page. The offer catalog names/descriptions stay English by the
  // loanword convention (SEO structured data, not visible copy).
  const professionalServiceLd = {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "@id": `${SITE_URL}/#service`,
    name: "Agustin Gonzalez Nicolini — Leadership & Engineering Coaching",
    url: `${SITE_URL}${localizePath("/services", locale)}`,
    image: `${SITE_URL}/profile.jpg`,
    description,
    ...(locale !== SOURCE_LOCALE ? { inLanguage: locale } : {}),
    provider: { "@id": `${SITE_URL}/#person` },
    founder: { "@id": `${SITE_URL}/#person` },
    priceRange: "$$",
    email: "info@agusgonzaleznic.com",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Berlin",
      addressCountry: "DE",
    },
    areaServed: [
      { "@type": "Place", name: "Worldwide (remote)" },
      { "@type": "Place", name: "European Union" },
      { "@type": "Place", name: "Berlin, Germany" },
    ],
    availableLanguage: ["English", "Spanish", "German"],
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Coaching Services",
      itemListElement: [
        {
          "@type": "Offer",
          itemOffered: {
            "@type": "Service",
            name: "Executive Leadership Coaching",
            description:
              "Executive-level coaching covering organization design, board and stakeholder influence, technology strategy, and presence under pressure.",
          },
        },
        {
          "@type": "Offer",
          itemOffered: {
            "@type": "Service",
            name: "Team & Manager Coaching",
            description:
              "Delivery-focused coaching: DORA metrics, release cadence, team rituals, hiring frameworks, and DevOps/GitOps practice.",
          },
        },
        {
          "@type": "Offer",
          itemOffered: {
            "@type": "Service",
            name: "Career Transition Coaching",
            description:
              "Structured 8–12 week programs for the IC-to-manager, manager-to-director, and director-to-VP jumps.",
          },
        },
      ],
    },
  };

  return (
    <SeoPage
      path="/services"
      ogImage={content?.og_image}
      title={title}
      description={description}
      crumb={t`Services`}
      about={{ "@id": `${SITE_URL}/#service` }}
      extraSchema={[professionalServiceLd]}
    >
      <Services block={servicesBlock} />
      <Testimonials block={testimonialsBlock} />
      <RelatedPages page="services" />
    </SeoPage>
  );
};

export default ServicesPage;

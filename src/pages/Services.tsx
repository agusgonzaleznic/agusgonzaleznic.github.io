import { useLingui } from "@lingui/react/macro";
import { SeoPage } from "@/components/SeoPage";
import { Services } from "@/components/Services";
import { Testimonials } from "@/components/Testimonials";
import { SITE_URL } from "@/lib/blog";

// ProfessionalService + offer catalog. Relocated here from index.html's @graph
// (the services now live on this page). @id stays the site-global entity id so
// references to it (and the Person it links) resolve across pages.
const professionalServiceLd = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  "@id": `${SITE_URL}/#service`,
  name: "Agustin Gonzalez Nicolini — Leadership & Engineering Coaching",
  url: `${SITE_URL}/services`,
  image: `${SITE_URL}/profile.jpg`,
  description:
    "One-on-one, remote-first coaching for senior technology leaders, offered in English, Spanish, and German: executive coaching at CTO and VP level, delivery-focused coaching for engineering managers and directors, and structured programs for engineers moving into management.",
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

const ServicesPage = () => {
  const { t } = useLingui();
  return (
    <SeoPage
      path="/services"
      title={t`Engineering Leadership Coaching — CTO, VP & Manager`}
      description={t`One-on-one coaching for CTOs, VPs, directors, and engineering managers — executive coaching, delivery and team coaching, and IC-to-manager programs.`}
      crumb="Services"
      extraSchema={[professionalServiceLd]}
    >
      <Services />
      <Testimonials />
    </SeoPage>
  );
};

export default ServicesPage;

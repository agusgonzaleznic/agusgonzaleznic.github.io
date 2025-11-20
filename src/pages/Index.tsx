import { lazy, Suspense } from "react";
import { Helmet } from "react-helmet";
import { Navigation } from "@/components/Navigation";
import { Hero } from "@/components/Hero";

// Lazy load below-the-fold components for better initial load performance
const About = lazy(() => import("@/components/About").then(m => ({ default: m.About })));
const Philosophy = lazy(() => import("@/components/Philosophy").then(m => ({ default: m.Philosophy })));
const Services = lazy(() => import("@/components/Services").then(m => ({ default: m.Services })));
const Impact = lazy(() => import("@/components/Impact").then(m => ({ default: m.Impact })));
const Testimonials = lazy(() => import("@/components/Testimonials").then(m => ({ default: m.Testimonials })));
const Contact = lazy(() => import("@/components/Contact").then(m => ({ default: m.Contact })));
const Footer = lazy(() => import("@/components/Footer").then(m => ({ default: m.Footer })));

const Index = () => {
  // JSON-LD Schema for SEO - Local Business
  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": "Agustin Gonzalez Nicolini - Leadership & Engineering Coaching",
    "image": "https://agusgonzaleznic.com/profile.jpg",
    "logo": "https://agusgonzaleznic.com/profile.jpg",
    "description": "Executive coaching for CTOs, VPs, and engineering leaders. Scale teams, ship faster, and lead with confidence. Specializing in DevOps, cloud infrastructure, FinOps, and DORA metrics.",
    "url": "https://agusgonzaleznic.com",
    "telephone": "+00-000-0000000",
    "email": "info@agusgonzaleznic.com",
    "priceRange": "$$",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "",
      "addressLocality": "Berlin",
      "postalCode": "",
      "addressCountry": "DE"
    },
    "areaServed": [
      {
        "@type": "Place",
        "name": "European Union"
      },
      {
        "@type": "Place",
        "name": "Remote"
      }
    ],
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "name": "Coaching Services",
      "itemListElement": [
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Executive Leadership Coaching",
            "description": "For CTOs, VPs, and Directors focused on strategic leadership and organizational transformation"
          }
        },
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Team & Manager Coaching",
            "description": "For Engineering Managers and Tech Leads to build high-performing teams"
          }
        },
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Career Transition Coaching",
            "description": "For engineers moving into leadership roles"
          }
        }
      ]
    }
  };

  // JSON-LD Schema - Person (for knowledge graph)
  const personSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": "Agustin Gonzalez Nicolini",
    "alternateName": "Agus",
    "url": "https://agusgonzaleznic.com",
    "image": "https://agusgonzaleznic.com/profile.jpg",
    "jobTitle": "VP of Engineering & Leadership Coach",
    "worksFor": {
      "@type": "Organization",
      "name": "JUCR GmbH"
    },
    "description": "VP of Engineering and Leadership Coach with 15+ years of experience across fintech, gaming, and e-mobility industries. Specializes in helping engineering leaders scale teams and improve delivery.",
    "email": "info@agusgonzaleznic.com",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Berlin",
      "addressCountry": "DE"
    },
    "sameAs": [
      "https://www.linkedin.com/in/agusgonzaleznic/",
      "https://github.com/agusgonzaleznic"
    ],
    "knowsLanguage": ["en", "es", "de"]
  };

  // Breadcrumb Schema
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "https://agusgonzaleznic.com/"
      }
    ]
  };

  return (
    <>
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify(localBusinessSchema)}
        </script>
        <script type="application/ld+json">
          {JSON.stringify(personSchema)}
        </script>
        <script type="application/ld+json">
          {JSON.stringify(breadcrumbSchema)}
        </script>
      </Helmet>

      <div className="min-h-screen">
        <Navigation />
        <main>
          <Hero />
          <Suspense fallback={<div className="min-h-screen" />}>
            <About />
            <Philosophy />
            <Services />
            <Impact />
            <Testimonials />
            <Contact />
          </Suspense>
        </main>
        <Suspense fallback={<div />}>
          <Footer />
        </Suspense>
      </div>
    </>
  );
};

export default Index;

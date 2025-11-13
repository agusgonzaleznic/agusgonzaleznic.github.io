import { Helmet } from "react-helmet";
import { Navigation } from "@/components/Navigation";
import { Hero } from "@/components/Hero";
import { About } from "@/components/About";
import { Philosophy } from "@/components/Philosophy";
import { Services } from "@/components/Services";
import { Impact } from "@/components/Impact";
import { Testimonials } from "@/components/Testimonials";
import { Contact } from "@/components/Contact";
import { Footer } from "@/components/Footer";

const Index = () => {
  // JSON-LD Schema for SEO - Professional Service
  const professionalServiceSchema = {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "name": "Agustin Gonzalez Nicolini - Leadership & Engineering Coaching",
    "image": "https://agusgonzaleznic.com/profile.jpg",
    "logo": "https://agusgonzaleznic.com/profile.jpg",
    "description": "Executive coaching for CTOs, VPs, and engineering leaders. Scale teams, ship faster, and lead with confidence. Specializing in DevOps, cloud infrastructure, FinOps, and DORA metrics.",
    "url": "https://agusgonzaleznic.com",
    "telephone": "+49-173-5347929",
    "email": "agustingonzaleznicolini@gmail.com",
    "priceRange": "$$",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Berlin",
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
    "serviceType": ["Leadership Coaching", "Executive Coaching", "Engineering Management Coaching"],
    "availableLanguage": ["English", "Spanish", "German"],
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
    },
    "provider": {
      "@type": "Person",
      "name": "Agustin Gonzalez Nicolini",
      "jobTitle": "VP of Engineering & Leadership Coach",
      "url": "https://agusgonzaleznic.com",
      "image": "https://agusgonzaleznic.com/profile.jpg",
      "sameAs": [
        "https://www.linkedin.com/in/agusgonzaleznic/",
        "https://github.com/agusgonzaleznic"
      ],
      "knowsAbout": [
        "Leadership Coaching",
        "Engineering Management",
        "DevOps",
        "Cloud Infrastructure",
        "FinOps",
        "Security",
        "DORA Metrics",
        "Team Scaling",
        "Site Reliability Engineering"
      ],
      "alumniOf": "Universidad Tecnológica Nacional",
      "nationality": "Argentina"
    }
  };

  // JSON-LD Schema - Person (for knowledge graph)
  const personSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": "Agustin Gonzalez Nicolini",
    "alternateName": "Agus Gonzalez",
    "url": "https://agusgonzaleznic.com",
    "image": "https://agusgonzaleznic.com/profile.jpg",
    "jobTitle": "VP of Engineering & Leadership Coach",
    "worksFor": {
      "@type": "Organization",
      "name": "JUCR GmbH"
    },
    "description": "VP of Engineering and Leadership Coach with 15+ years of experience across fintech, gaming, and e-mobility industries. Specializes in helping engineering leaders scale teams and improve delivery.",
    "email": "agustingonzaleznicolini@gmail.com",
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
          {JSON.stringify(professionalServiceSchema)}
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
          <About />
          <Philosophy />
          <Services />
          <Impact />
          <Testimonials />
          <Contact />
        </main>
        <Footer />
      </div>
    </>
  );
};

export default Index;

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
  // JSON-LD Schema for SEO
  const schemaData = {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "name": "Agustin Gonzalez Nicolini - Leadership & Engineering Coaching",
    "image": "https://yourdomain.com/profile.jpg",
    "description": "Executive coaching for CTOs, VPs, and engineering leaders. Scale teams, ship faster, and lead with confidence.",
    "url": "https://yourdomain.com",
    "telephone": "+49-173-5347929",
    "email": "agustingonzaleznicolini@gmail.com",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Berlin",
      "addressCountry": "DE"
    },
    "areaServed": ["EU", "Remote"],
    "serviceType": "Leadership Coaching",
    "provider": {
      "@type": "Person",
      "name": "Agustin Gonzalez Nicolini",
      "jobTitle": "VP of Engineering & Leadership Coach",
      "knowsAbout": [
        "Leadership Coaching",
        "Engineering Management",
        "DevOps",
        "Cloud Infrastructure",
        "FinOps",
        "Security",
        "DORA Metrics",
        "Team Scaling"
      ]
    }
  };

  return (
    <>
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify(schemaData)}
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

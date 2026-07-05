import { Helmet } from "react-helmet";
import { Navigation } from "@/components/Navigation";
import { Hero } from "@/components/Hero";
import { About } from "@/components/About";
import { Philosophy } from "@/components/Philosophy";
import { Services } from "@/components/Services";
import { Impact } from "@/components/Impact";
import { Testimonials } from "@/components/Testimonials";
import { FAQ } from "@/components/FAQ";
import { Contact } from "@/components/Contact";
import { Footer } from "@/components/Footer";

// NOTE: JSON-LD structured data now lives statically in index.html so that AI
// crawlers that don't execute JavaScript can read it. Don't re-add it here, or
// it will be duplicated for JS-capable clients.
//
// Imports are static (not React.lazy) on purpose: the home page is prerendered
// to static HTML at build time (see scripts/prerender.mjs), and renderToString
// can only emit eagerly-imported components — lazy ones would render as empty
// Suspense fallbacks and defeat the prerender.

const Index = () => {
  return (
    <div className="min-h-screen">
      {/* Restores the homepage head after client-side navigation away from a
          blog route (react-helmet never resets titles on its own). Must stay
          textually identical to the static head in index.html — prerender
          keeps the template head for "/", so a mismatch would flash on
          hydration. */}
      <Helmet>
        <title>Agustin Gonzalez Nicolini | Engineering Leadership Coach</title>
        <meta
          name="description"
          content="Executive coaching for CTOs, VPs, and engineering managers. Scale teams, cut lead time, ship reliably — 15+ years of engineering leadership. Berlin & remote."
        />
      </Helmet>
      <Navigation />
      <main>
        <Hero />
        <About />
        <Philosophy />
        <Services />
        <Impact />
        <Testimonials />
        <FAQ />
        <Contact />
      </main>
      <Footer />
    </div>
  );
};

export default Index;

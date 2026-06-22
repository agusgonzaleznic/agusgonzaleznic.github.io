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

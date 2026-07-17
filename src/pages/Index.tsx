import { Helmet } from "react-helmet";
import { useLingui } from "@lingui/react/macro";
import { Navigation } from "@/components/Navigation";
import { Hero } from "@/components/Hero";
import { Footer } from "@/components/Footer";

// The home page is now strictly the Hero. The former one-page sections (About,
// Philosophy, Services, Impact, Testimonials, FAQ, Contact) are their own
// indexable routes (src/pages/*), each with its own <title>, H1, and JSON-LD.
//
// NOTE: JSON-LD (WebSite + Person) lives statically in index.html so AI crawlers
// that don't execute JavaScript can read it. Don't re-add it here, or it will be
// duplicated for JS-capable clients. The FAQPage and ProfessionalService nodes
// moved to /faq and /services, alongside the content they describe.
//
// Index stays a static (non-lazy) import: the home page is prerendered to static
// HTML at build time (scripts/prerender.mjs), and renderToString can only emit
// eagerly-imported components — a lazy one would render as an empty Suspense
// fallback and defeat the prerender.

const Index = () => {
  const { t } = useLingui();
  return (
    <div className="min-h-screen">
      {/* Restores the homepage head after client-side navigation back from
          another route (react-helmet never resets titles on its own). The
          ENGLISH text must stay byte-identical to the static head in
          index.html (prerender keeps the template head for "/", so a mismatch
          would flash on hydration) — with Lingui, EN renders the msgid
          verbatim, so that contract holds; prefixed locales get the
          translated head (prerender injects the same strings statically via
          localizeHomeHead, so the rendered head matches in every locale). */}
      <Helmet>
        <title>{t`Agustin Gonzalez Nicolini | Engineering Leadership Coach`}</title>
        <meta
          name="description"
          content={t`Executive coaching for CTOs, VPs, and engineering managers. Scale teams, cut lead time, ship reliably — 15+ years of engineering leadership. Berlin & remote.`}
        />
      </Helmet>
      <Navigation />
      <main>
        <Hero />
      </main>
      <Footer />
    </div>
  );
};

export default Index;

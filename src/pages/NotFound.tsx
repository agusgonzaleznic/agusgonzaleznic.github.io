import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Helmet } from "react-helmet";
import { Trans } from "@lingui/react/macro";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { LocaleLink } from "@/components/LocaleLink";
import { SECTION_PADDING } from "@/lib/layout";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Unknown paths hit the SPA fallback with HTTP 200; tell crawlers not to
          index these soft-404s (follow so link equity still flows). */}
      <Helmet>
        <meta name="robots" content="noindex, follow" />
      </Helmet>
      <Navigation />
      <main className="flex flex-1 items-center pt-16">
        <section className={`w-full bg-background ${SECTION_PADDING}`}>
          <div className="container px-6">
            <div className="max-w-3xl mx-auto text-center animate-fade-in-up">
              <h1 className="text-fluid-3xl font-bold mb-6">404</h1>
              <p className="text-fluid-lg text-muted-foreground mb-8">
                <Trans>This page doesn't exist — but the conversation can still start
                somewhere useful.</Trans>
              </p>
              <LocaleLink to="/" className="font-medium text-accent hover:underline">
                <Trans>Return to home</Trans>
              </LocaleLink>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default NotFound;

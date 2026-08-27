import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Helmet } from "react-helmet";
import { Trans, useLingui } from "@lingui/react/macro";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { LocaleLink } from "@/components/LocaleLink";
import { Button } from "@/components/ui/button";
import { SECTION_PADDING } from "@/lib/layout";
import { LocaleLinksContext } from "@/i18n/locale-links";

const NotFound = () => {
  const location = useLocation();
  const { t } = useLingui();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  // A few useful destinations for a dead-end visitor (labels reuse the nav's).
  const links: { to: string; label: string }[] = [
    { to: "/about", label: t`About` },
    { to: "/services", label: t`Services` },
    { to: "/blog/", label: t`Blog` },
    { to: "/contact", label: t`Contact` },
  ];

  return (
    // There is no "this page in German" for a URL that does not exist, so the
    // switcher points at each locale's home instead of localizing the dead path
    // into another 404. Note this is a HYDRATION-time fix as much as a
    // prerender-time one: the static 404.html carries the synthetic route path,
    // but the page a visitor actually sees carries whatever they typed, and it
    // is that live copy that was minting /de/<their-typo> links.
    <LocaleLinksContext.Provider value={{ basePath: "/" }}>
    <div className="flex min-h-screen flex-col">
      {/*
        This page is served with a real HTTP 404 (CloudFront custom error →
        /404.html; see terraform/cdn.tf) plus the noindex tag below, so crawlers
        drop unknown/removed URLs cleanly instead of treating them as soft 404s
        or indexing a 200 homepage on a wrong URL. `follow` keeps link equity
        flowing through the on-page links.
      */}
      <Helmet>
        <title>{t`Page not found | Agustin Gonzalez Nicolini`}</title>
        <meta
          name="description"
          content={t`This page doesn't exist. Head back to the homepage, or jump to about, services, the blog, or contact.`}
        />
        <meta name="robots" content="noindex, follow" />
      </Helmet>
      <Navigation />
      <main className="flex flex-1 items-center pt-16">
        <section className={`w-full bg-background ${SECTION_PADDING}`}>
          <div className="container px-6">
            <div className="mx-auto max-w-2xl text-center animate-fade-in-up">
              <p className="font-serif text-7xl font-bold text-accent md:text-8xl">404</p>
              <h1 className="mt-4 text-fluid-2xl font-bold">
                <Trans>This page doesn't exist</Trans>
              </h1>
              <p className="mt-4 text-fluid-lg text-muted-foreground">
                <Trans>The link may be broken or the page may have moved, but the
                conversation can still start somewhere useful.</Trans>
              </p>

              <div className="mt-10 flex justify-center">
                <Button
                  asChild
                  size="lg"
                  className="bg-accent hover:bg-accent-hover text-accent-foreground shadow-accent"
                >
                  <LocaleLink to="/"><Trans>Back to home</Trans></LocaleLink>
                </Button>
              </div>

              <nav className="mt-8" aria-label={t`Popular pages`}>
                <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
                  {links.map((l) => (
                    <li key={l.to}>
                      <LocaleLink
                        to={l.to}
                        className="font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-accent hover:underline"
                      >
                        {l.label}
                      </LocaleLink>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
    </LocaleLinksContext.Provider>
  );
};

export default NotFound;

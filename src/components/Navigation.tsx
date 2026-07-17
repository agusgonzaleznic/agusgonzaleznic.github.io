import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { LocaleLink } from "@/components/LocaleLink";
import { BOOKING_URL } from "@/lib/booking";
import { delocalizePath } from "@/i18n/locales";
import { CONTACT_CTA_ID, SERVICES_CTA_ID, setStickyCtaVisible } from "@/lib/layout";

// Every nav entry is now its own route (About, Philosophy, … each have a page).
// They render as locale-aware <LocaleLink>s and navigate client-side (content
// swaps in place, no reload) — bare paths, never a /#hash.
type NavLink = { label: string; to: string };

// Static class names so Tailwind's scanner keeps them; index.css only defines
// .delay-100 through .delay-400, so the stagger caps there.
const STAGGER_DELAYS = ["", "delay-100", "delay-200", "delay-300", "delay-400"];
const staggerDelay = (index: number) =>
  STAGGER_DELAYS[Math.min(index, STAGGER_DELAYS.length - 1)];

export const Navigation = () => {
  const { t } = useLingui();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // Starts hidden so the prerendered HTML never carries the sticky CTA (it
  // would flash on top of the hero CTA before hydration).
  const [isStickyCtaVisible, setIsStickyCtaVisible] = useState(false);
  const location = useLocation();
  // Locale-aware: treat /{locale}/ and /{locale}/blog like their English roots
  // so the logo and blog-specific behaviour work under every language.
  const basePath = delocalizePath(location.pathname);
  const isHome = basePath === "/";
  const isBlog = basePath.startsWith("/blog");

  useEffect(() => {
    // Hysteresis (dead-band) so the bar can't flicker. A single `scrollY > 50`
    // threshold flips the scrolled style on/off repeatedly when the user hovers
    // around 50px during a slow scroll, and each flip re-fires the 300ms
    // background/blur/shadow transition. Instead: switch to the solid style only
    // after scrolling clearly past the top (>64px), and back to transparent only
    // once essentially back at the very top (<8px); hold state in between.
    const SCROLL_ON = 64;
    const SCROLL_OFF = 8;
    const handleScroll = () => {
      const y = window.scrollY;
      setIsScrolled((prev) => (prev ? y > SCROLL_OFF : y > SCROLL_ON));
    };

    handleScroll(); // set correct initial state (e.g. loaded at an anchor)
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Show the sticky CTA only while no inline booking affordance is on screen —
  // the contact form's submit button (/contact) and the Services bottom
  // "Book an Intro Call" CTA (/services). Pages without one always show it.
  useEffect(() => {
    // Every route change starts from hidden: without this, state left over
    // from a branch below flashes the sticky CTA on top of an inline CTA
    // until the new observer's first async callback fires.
    setIsStickyCtaVisible(false);
    if (isBlog) return;
    const targets = [CONTACT_CTA_ID, SERVICES_CTA_ID]
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) {
      // Route without an inline booking CTA (home, content and legal pages):
      // always show it.
      setIsStickyCtaVisible(true);
      return () => setIsStickyCtaVisible(false);
    }
    const inView = new Set<Element>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) inView.add(entry.target);
        else inView.delete(entry.target);
      }
      setIsStickyCtaVisible(inView.size === 0);
    });
    targets.forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      setIsStickyCtaVisible(false);
    };
  }, [isBlog, location.pathname]);

  // Publish whether the sticky CTA is actually rendered (same condition as
  // the JSX below) so CookieNotice can stack the consent banner above it
  // only when it exists — see the store in src/lib/layout.ts.
  // On home the CTA additionally waits for the first scroll (isScrolled):
  // the landing fold stays clean — especially on a first visit, when the
  // consent banner is also on screen — and the CTA appears with engagement.
  const showStickyCta =
    !isMobileMenuOpen && !isBlog && isStickyCtaVisible && (!isHome || isScrolled);
  useEffect(() => {
    setStickyCtaVisible(showStickyCta);
    return () => setStickyCtaVisible(false);
  }, [showStickyCta]);

  const scrollToTop = () => {
    setIsMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Booking CTAs render as real anchors (crawlable, cmd/middle-click) — this
  // just closes the mobile menu when one is followed from there.
  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  const navLinks: NavLink[] = [
    { label: t`About`, to: "/about" },
    { label: t`Philosophy`, to: "/philosophy" },
    { label: t`Services`, to: "/services" },
    { label: t`Impact`, to: "/impact" },
    { label: t`FAQ`, to: "/faq" },
    { label: t`Blog`, to: "/blog/" },
    { label: t`Contact`, to: "/contact" },
  ];

  const renderNavLink = (link: NavLink, className: string) => (
    <LocaleLink
      key={link.to}
      to={link.to}
      onClick={() => setIsMobileMenuOpen(false)}
      className={className}
    >
      {link.label}
    </LocaleLink>
  );

  return (
    <>
      <nav
        // transform-gpu keeps the bar on its own compositor layer so scrolling
        // content behind it doesn't force per-frame repaints of the bar.
        // No backdrop-blur: a backdrop-filter on a fixed element re-rasterizes
        // every scroll frame and flickers/shimmers in Chrome & Safari. The
        // background is near-opaque (95%) so the blur was barely visible anyway.
        // Transition scoped to the two properties that actually change.
        className={`fixed top-0 left-0 right-0 z-50 transform-gpu transition-[background-color,box-shadow] duration-300 ${
          isScrolled ? "bg-background/95 shadow-md" : "bg-transparent shadow-none"
        }`}
      >
        <div className="container px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo / Brand */}
            {isHome ? (
              <button
                onClick={scrollToTop}
                className="text-xl font-serif font-bold text-foreground hover:text-accent transition-colors"
              >
                AGN
              </button>
            ) : (
              <LocaleLink
                to="/"
                className="text-xl font-serif font-bold text-foreground hover:text-accent transition-colors"
              >
                AGN
              </LocaleLink>
            )}

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              {navLinks.map((link) =>
                renderNavLink(
                  link,
                  "text-sm font-medium text-muted-foreground hover:text-accent transition-colors",
                ),
              )}
              <Button
                asChild
                className="bg-accent hover:bg-accent-hover text-accent-foreground"
              >
                <a href={BOOKING_URL} target="_blank" rel="noopener noreferrer">
                  <Trans>Book a Session</Trans>
                </a>
              </Button>
              {/* Crawlable locale links (compact dropdown) — renders nothing until
                  >=2 locales are published, so the English DOM is unchanged today. */}
              <LanguageSwitcher variant="dropdown" />
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 text-foreground hover:text-accent transition-colors"
              aria-label={t`Toggle menu`}
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-background/95 backdrop-blur-md"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="relative h-full flex flex-col items-center justify-center gap-8 p-6">
            {navLinks.map((link, index) =>
              renderNavLink(
                link,
                `text-2xl font-medium text-foreground hover:text-accent transition-all animate-fade-in-up ${staggerDelay(index)}`,
              ),
            )}
            <Button
              asChild
              size="lg"
              className="bg-accent hover:bg-accent-hover text-accent-foreground animate-fade-in-up delay-400"
            >
              <a
                href={BOOKING_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={closeMobileMenu}
              >
                <Trans>Book a Session</Trans>
              </a>
            </Button>
          </div>
        </div>
      )}

      {/* Sticky CTA on mobile — suppressed on blog routes so it doesn't
          permanently cover the bottom of long-form reading, and while an
          inline booking CTA is already visible. Stays bottom-0 z-40: the
          CookieNotice (z-50) reads the store above and moves to bottom-24
          on mobile only while this is rendered. */}
      {showStickyCta && (
        <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden p-4 bg-gradient-to-t from-background via-background to-transparent">
          <Button
            asChild
            size="lg"
            className="w-full bg-accent hover:bg-accent-hover text-accent-foreground shadow-accent"
          >
            <a href={BOOKING_URL} target="_blank" rel="noopener noreferrer">
              <Trans>Book a Session</Trans>
            </a>
          </Button>
        </div>
      )}
    </>
  );
};

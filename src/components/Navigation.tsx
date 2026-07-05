import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";

// Section links only scroll on the home page; on any other route they become
// plain /#<id> anchors (SSR-safe, works from prerendered HTML pre-hydration).
type NavLink = { label: string; id?: string; to?: string };

// Static class names so Tailwind's scanner keeps them; index.css only defines
// .delay-100 through .delay-400, so the stagger caps there.
const STAGGER_DELAYS = ["", "delay-100", "delay-200", "delay-300", "delay-400"];
const staggerDelay = (index: number) =>
  STAGGER_DELAYS[Math.min(index, STAGGER_DELAYS.length - 1)];

export const Navigation = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const isHome = location.pathname === "/";
  const isBlog = location.pathname.startsWith("/blog");

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    setIsMobileMenuOpen(false);
    if (id === "top") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const handleContact = () => {
    setIsMobileMenuOpen(false);
    window.open("https://calendar.app.google/kFaanhSae5WefLnD7", "_blank");
  };

  const navLinks: NavLink[] = [
    { label: "About", id: "about" },
    { label: "Philosophy", id: "philosophy" },
    { label: "Services", id: "services" },
    { label: "Impact", id: "impact" },
    { label: "FAQ", id: "faq" },
    { label: "Blog", to: "/blog/" },
    { label: "Contact", id: "contact" },
  ];

  const renderNavLink = (link: NavLink, className: string) => {
    if (link.to) {
      return (
        <Link
          key={link.label}
          to={link.to}
          onClick={() => setIsMobileMenuOpen(false)}
          className={className}
        >
          {link.label}
        </Link>
      );
    }
    if (isHome) {
      return (
        <button
          key={link.label}
          onClick={() => scrollToSection(link.id!)}
          className={className}
        >
          {link.label}
        </button>
      );
    }
    return (
      <a
        key={link.label}
        href={`/#${link.id}`}
        onClick={() => setIsMobileMenuOpen(false)}
        className={className}
      >
        {link.label}
      </a>
    );
  };

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? "bg-background/95 backdrop-blur-md shadow-md"
            : "bg-transparent"
        }`}
      >
        <div className="container px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo / Brand */}
            {isHome ? (
              <button
                onClick={() => scrollToSection("top")}
                className="text-xl font-serif font-bold text-foreground hover:text-accent transition-colors"
              >
                AGN
              </button>
            ) : (
              <Link
                to="/"
                className="text-xl font-serif font-bold text-foreground hover:text-accent transition-colors"
              >
                AGN
              </Link>
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
                onClick={handleContact}
                className="bg-accent hover:bg-accent-hover text-accent-foreground"
              >
                Book a Session
              </Button>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 text-foreground hover:text-accent transition-colors"
              aria-label="Toggle menu"
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
              onClick={handleContact}
              size="lg"
              className="bg-accent hover:bg-accent-hover text-accent-foreground animate-fade-in-up delay-400"
            >
              Book a Session
            </Button>
          </div>
        </div>
      )}

      {/* Sticky CTA on mobile — suppressed on blog routes so it doesn't
          permanently cover the bottom of long-form reading. */}
      {!isMobileMenuOpen && !isBlog && (
        <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden p-4 bg-gradient-to-t from-background via-background to-transparent">
          <Button
            onClick={handleContact}
            size="lg"
            className="w-full bg-accent hover:bg-accent-hover text-accent-foreground shadow-accent"
          >
            Book a Session
          </Button>
        </div>
      )}
    </>
  );
};

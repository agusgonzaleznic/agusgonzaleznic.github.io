import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";

export const Navigation = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

  const navLinks = [
    { label: "About", id: "about" },
    { label: "Philosophy", id: "philosophy" },
    { label: "Services", id: "services" },
    { label: "Impact", id: "impact" },
    { label: "Contact", id: "contact" },
  ];

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
            <button
              onClick={() => scrollToSection("top")}
              className="text-xl font-serif font-bold text-foreground hover:text-accent transition-colors"
            >
              AGN
            </button>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <button
                  key={link.id}
                  onClick={() => scrollToSection(link.id)}
                  className="text-sm font-medium text-foreground/80 hover:text-accent transition-colors"
                >
                  {link.label}
                </button>
              ))}
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
            {navLinks.map((link, index) => (
              <button
                key={link.id}
                onClick={() => scrollToSection(link.id)}
                className={`text-2xl font-medium text-foreground hover:text-accent transition-all animate-fade-in-up delay-${index * 100}`}
              >
                {link.label}
              </button>
            ))}
            <Button
              onClick={handleContact}
              size="lg"
              className="bg-accent hover:bg-accent-hover text-accent-foreground animate-fade-in-up delay-500"
            >
              Book a Session
            </Button>
          </div>
        </div>
      )}

      {/* Sticky CTA on mobile */}
      {!isMobileMenuOpen && (
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

import { Mail, Linkedin, Github } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

export const Footer = () => {
  const currentYear = new Date().getFullYear();
  const location = useLocation();
  const isHome = location.pathname === "/";

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  // Section links scroll on the home page; elsewhere they become /#<id>
  // anchors so they still work (scrollToSection would silently no-op there).
  const quickLinks: { label: string; id?: string; to?: string }[] = [
    { label: "About", id: "about" },
    { label: "Services", id: "services" },
    { label: "Impact", id: "impact" },
    { label: "Blog", to: "/blog/" },
    { label: "Contact", id: "contact" },
  ];

  return (
    <footer className="bg-primary text-primary-foreground py-12 md:py-16">
      <div className="container px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 md:gap-12 mb-12">
            {/* Brand */}
            <div className="md:col-span-2">
              <h3 className="text-2xl font-serif font-bold mb-3">Agustin Gonzalez Nicolini</h3>
              <p className="text-primary-foreground/90 text-sm leading-relaxed mb-4">
                Coaching for engineering leaders, from someone who has held the pager.
              </p>
              <p className="text-primary-foreground/80 text-xs">
                Based in Berlin, from Haedo • Coaching globally
              </p>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-bold mb-4 text-sm uppercase tracking-wider">Quick Links</h4>
              <ul className="space-y-2 text-sm">
                {quickLinks.map((link) => (
                  <li key={link.label}>
                    {link.to ? (
                      <Link
                        to={link.to}
                        className="text-primary-foreground/90 hover:text-accent transition-colors"
                      >
                        {link.label}
                      </Link>
                    ) : isHome ? (
                      <button
                        onClick={() => scrollToSection(link.id!)}
                        className="text-primary-foreground/90 hover:text-accent transition-colors"
                      >
                        {link.label}
                      </button>
                    ) : (
                      <a
                        href={`/#${link.id}`}
                        className="text-primary-foreground/90 hover:text-accent transition-colors"
                      >
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {/* Connect */}
            <div>
              <h4 className="font-bold mb-4 text-sm uppercase tracking-wider">Connect</h4>
              <div className="flex gap-3">
                <a
                  href="https://www.linkedin.com/in/agusgonzaleznic"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-lg bg-primary-foreground/10 hover:bg-accent flex items-center justify-center transition-colors group"
                  aria-label="LinkedIn Profile"
                >
                  <Linkedin className="w-5 h-5 text-primary-foreground group-hover:text-accent-foreground" />
                </a>
                <a
                  href="https://github.com/agusgonzaleznic"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-lg bg-primary-foreground/10 hover:bg-accent flex items-center justify-center transition-colors group"
                  aria-label="GitHub Profile"
                >
                  <Github className="w-5 h-5 text-primary-foreground group-hover:text-accent-foreground" />
                </a>
                <a
                  href="mailto:info@agusgonzaleznic.com"
                  className="w-10 h-10 rounded-lg bg-primary-foreground/10 hover:bg-accent flex items-center justify-center transition-colors group"
                  aria-label="Email"
                >
                  <Mail className="w-5 h-5 text-primary-foreground group-hover:text-accent-foreground" />
                </a>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="pt-8 border-t border-primary-foreground/10">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-primary-foreground/80">
              <p>
                © {currentYear} Agustin Gonzalez Nicolini. All rights reserved.
              </p>
              <div className="flex gap-6">
                <a href="/privacy" className="hover:text-accent transition-colors">
                  Privacy Policy
                </a>
                <a href="/impressum" className="hover:text-accent transition-colors">
                  Impressum
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

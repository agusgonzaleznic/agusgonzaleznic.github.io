import { Mail } from "lucide-react";
import { SiLinkedin, SiGithub } from "react-icons/si";

export const Footer = () => {
  const currentYear = new Date().getFullYear();

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <footer className="bg-primary text-primary-foreground py-12 md:py-16">
      <div className="container px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 md:gap-12 mb-12">
            {/* Brand */}
            <div className="md:col-span-2">
              <h3 className="text-2xl font-serif font-bold mb-3">Agustin Gonzalez Nicolini</h3>
              <p className="text-primary-foreground/80 text-sm leading-relaxed mb-4">
                Empowering engineering leaders to build resilient teams, ship faster, and lead with confidence.
              </p>
              <p className="text-primary-foreground/70 text-xs">
                Based in Berlin, from Haedo • Coaching globally
              </p>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider">Quick Links</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <button
                    onClick={() => scrollToSection("about")}
                    className="text-primary-foreground/80 hover:text-accent transition-colors"
                  >
                    About
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollToSection("services")}
                    className="text-primary-foreground/80 hover:text-accent transition-colors"
                  >
                    Services
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollToSection("impact")}
                    className="text-primary-foreground/80 hover:text-accent transition-colors"
                  >
                    Impact
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollToSection("contact")}
                    className="text-primary-foreground/80 hover:text-accent transition-colors"
                  >
                    Contact
                  </button>
                </li>
              </ul>
            </div>

            {/* Connect */}
            <div>
              <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider">Connect</h4>
              <div className="flex gap-3">
                <a
                  href="https://www.linkedin.com/in/agusgonzaleznic"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-lg bg-primary-foreground/10 hover:bg-accent flex items-center justify-center transition-colors group"
                  aria-label="LinkedIn Profile"
                >
                  <SiLinkedin className="w-5 h-5 text-primary-foreground group-hover:text-accent-foreground" />
                </a>
                <a
                  href="https://github.com/agusgonzaleznic"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-lg bg-primary-foreground/10 hover:bg-accent flex items-center justify-center transition-colors group"
                  aria-label="GitHub Profile"
                >
                  <SiGithub className="w-5 h-5 text-primary-foreground group-hover:text-accent-foreground" />
                </a>
                <a
                  href="mailto:agustingonzaleznicolini@gmail.com"
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
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-primary-foreground/70">
              <p>
                © {currentYear} Agustin Gonzalez Nicolini. All rights reserved.
              </p>
              <div className="flex gap-6">
                <a href="#" className="hover:text-accent transition-colors">
                  Privacy Policy
                </a>
                <a href="#" className="hover:text-accent transition-colors">
                  Terms of Service
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

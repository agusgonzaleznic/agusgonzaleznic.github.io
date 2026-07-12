import { Mail, Linkedin, Github } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Trans, useLingui } from "@lingui/react/macro";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { LocaleLink } from "@/components/LocaleLink";
import { useLocalizedTo } from "@/i18n/useLocalizedTo";
import { delocalizePath } from "@/i18n/locales";

export const Footer = () => {
  const { t } = useLingui();
  const currentYear = new Date().getFullYear();
  const location = useLocation();
  const navigate = useNavigate();
  const localize = useLocalizedTo();
  // Locale-aware: /de/ (and every localized home) counts as home, so section
  // links scroll in place instead of navigating away.
  const isHome = delocalizePath(location.pathname) === "/";

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  // Section links scroll on the home page; elsewhere they navigate to "/"
  // with { scrollTo } state (ScrollManager scrolls after arrival) so the URL
  // never carries a lingering /#hash.
  const quickLinks: { label: string; id?: string; to?: string }[] = [
    { label: t`About`, id: "about" },
    { label: t`Services`, id: "services" },
    { label: t`Impact`, id: "impact" },
    { label: t`Blog`, to: "/blog/" },
    { label: t`Contact`, id: "contact" },
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
                <Trans>Coaching for engineering leaders, from someone who has held the pager.</Trans>
              </p>
              <p className="text-primary-foreground/80 text-xs">
                <Trans>Based in Berlin, from Haedo • Coaching globally</Trans>
              </p>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-bold mb-4 text-sm uppercase tracking-wider"><Trans>Quick Links</Trans></h4>
              <ul className="space-y-2 text-sm">
                {quickLinks.map((link) => (
                  <li key={link.id ?? link.to}>
                    {link.to ? (
                      <LocaleLink
                        to={link.to}
                        className="text-primary-foreground/90 hover:text-accent transition-colors"
                      >
                        {link.label}
                      </LocaleLink>
                    ) : isHome ? (
                      <button
                        onClick={() => scrollToSection(link.id!)}
                        className="text-primary-foreground/90 hover:text-accent transition-colors"
                      >
                        {link.label}
                      </button>
                    ) : (
                      <button
                        onClick={() => navigate(localize("/"), { state: { scrollTo: link.id } })}
                        className="text-primary-foreground/90 hover:text-accent transition-colors"
                      >
                        {link.label}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {/* Connect */}
            <div>
              <h4 className="font-bold mb-4 text-sm uppercase tracking-wider"><Trans>Connect</Trans></h4>
              <div className="flex gap-3">
                <a
                  href="https://www.linkedin.com/in/agusgonzaleznic"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-lg bg-primary-foreground/10 hover:bg-accent flex items-center justify-center transition-colors group"
                  aria-label={t`LinkedIn Profile`}
                >
                  <Linkedin className="w-5 h-5 text-primary-foreground group-hover:text-accent-foreground" />
                </a>
                <a
                  href="https://github.com/agusgonzaleznic"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-lg bg-primary-foreground/10 hover:bg-accent flex items-center justify-center transition-colors group"
                  aria-label={t`GitHub Profile`}
                >
                  <Github className="w-5 h-5 text-primary-foreground group-hover:text-accent-foreground" />
                </a>
                <a
                  href="mailto:info@agusgonzaleznic.com"
                  className="w-10 h-10 rounded-lg bg-primary-foreground/10 hover:bg-accent flex items-center justify-center transition-colors group"
                  aria-label={t`Email`}
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
                <Trans>© {currentYear} Agustin Gonzalez Nicolini. All rights reserved.</Trans>
              </p>
              <div className="flex gap-6">
                <LocaleLink to="/privacy" className="hover:text-accent transition-colors">
                  <Trans>Privacy Policy</Trans>
                </LocaleLink>
                <LocaleLink to="/impressum" className="hover:text-accent transition-colors">
                  <Trans>Impressum</Trans>
                </LocaleLink>
                {/* Crawlable locale links — renders nothing until >=2 locales
                    are published, so the English DOM is unchanged today. */}
                <LanguageSwitcher />
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

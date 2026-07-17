import { Mail, Linkedin, Github } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { LocaleLink } from "@/components/LocaleLink";

export const Footer = () => {
  const { t } = useLingui();
  const currentYear = new Date().getFullYear();

  // Each section is its own route now, so every quick link is a locale-aware
  // <LocaleLink> that navigates client-side (no reload) — bare paths, no /#hash.
  const quickLinks: { label: string; to: string }[] = [
    { label: t`About`, to: "/about" },
    { label: t`Philosophy`, to: "/philosophy" },
    { label: t`Services`, to: "/services" },
    { label: t`Impact`, to: "/impact" },
    { label: t`FAQ`, to: "/faq" },
    { label: t`Blog`, to: "/blog/" },
    { label: t`Contact`, to: "/contact" },
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
                  <li key={link.to}>
                    <LocaleLink
                      to={link.to}
                      className="text-primary-foreground/90 hover:text-accent transition-colors"
                    >
                      {link.label}
                    </LocaleLink>
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

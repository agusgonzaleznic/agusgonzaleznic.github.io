import { ArrowRight } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { LocaleLink } from "@/components/LocaleLink";

// Descriptive anchor text per target page — richer than the nav labels on
// purpose (the anchors describe the destination, which is what search engines
// and readers scan). One label per target, reused by every page that links it.
// All phrases are derived from copy that already exists on the site.
const LABELS: Record<string, { to: string; label: MessageDescriptor }> = {
  about: { to: "/about", label: msg`My story, from Haedo to Berlin` },
  philosophy: { to: "/philosophy", label: msg`The three pillars behind my coaching` },
  services: { to: "/services", label: msg`Coaching formats for CTOs, VPs, and engineering managers` },
  impact: { to: "/impact", label: msg`My track record: 15+ years leading engineering teams` },
  faq: { to: "/faq", label: msg`Common questions about fit, format, and how we start` },
  contact: { to: "/contact", label: msg`Book a free 30-minute intro call` },
};

// Which pages each page links to (never itself). Services — the money page —
// gets the most inbound links.
const RELATED: Record<string, (keyof typeof LABELS)[]> = {
  about: ["philosophy", "services", "impact"],
  philosophy: ["services", "about", "impact"],
  services: ["faq", "impact", "contact"],
  impact: ["services", "about", "contact"],
  faq: ["services", "philosophy", "contact"],
  contact: ["faq", "services", "about"],
};

// Compact cross-link block closing every section page: body-level internal
// links with descriptive anchors (prerendered + locale-aware), so no page is a
// dead end and every page passes context-rich links to its siblings. The
// hairline top border separates it from the section above without breaking the
// plain/tinted alternation.
export const RelatedPages = ({ page }: { page: keyof typeof RELATED }) => {
  const { i18n, t } = useLingui();
  const links = RELATED[page].map((key) => LABELS[key]);
  return (
    <nav aria-label={t`Keep exploring`} className="border-t border-border bg-background">
      <div className="container px-6 py-10 md:py-12">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-6">
            {t`Keep exploring`}
          </p>
          <ul className="space-y-3">
            {links.map((link) => (
              <li key={link.to}>
                <LocaleLink
                  to={link.to}
                  className="group inline-flex items-center gap-2 font-medium text-foreground hover:text-accent transition-colors"
                >
                  {i18n._(link.label)}
                  <ArrowRight className="h-4 w-4 shrink-0 group-hover:translate-x-1 transition-transform" />
                </LocaleLink>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </nav>
  );
};

import { Card } from "@/components/ui/card";
import { Trans, useLingui } from "@lingui/react/macro";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import type { PageBlock } from "@/lib/pages";
import { SECTION_HEADER_MARGIN, SECTION_PADDING_STACKED } from "@/lib/layout";

// Composite scenarios, not client quotes — coaching is confidential, and real
// endorsements will only ever appear with a client's explicit sign-off.
// Hardcoded fallback + seed source for Storyblok.
const DEFAULT_ENGAGEMENTS: { role: MessageDescriptor; context: MessageDescriptor; sketch: MessageDescriptor }[] = [
  {
    role: msg`Senior Engineering Manager`,
    context: msg`FinTech scale-up`,
    sketch: msg`The first call was about messy deploys. Within six months the pipeline was boring — in the best way — but the more useful work was getting them out of the middle of every decision their team makes.`,
  },
  {
    role: msg`First-Time Engineering Manager`,
    context: msg`E-Commerce Platform`,
    sketch: msg`A few months into the role and drowning. Instead of handing over a framework, we rehearsed the conversations they were avoiding — delegation, feedback, saying no — until having them for real felt routine.`,
  },
  {
    role: msg`VP of Engineering`,
    context: msg`B2B SaaS Company`,
    sketch: msg`One team became four in a year and everything got slower — it usually does. We sketched an org structure early on, then stress-tested and adjusted it over the following quarters as the company kept growing.`,
  },
];

export interface EngagementField {
  role?: string;
  context?: string;
  sketch?: string;
}
export interface TestimonialsBlock extends PageBlock {
  heading?: string;
  subheading?: string;
  note?: string;
  engagements?: EngagementField[];
}

export const Testimonials = ({ block }: { block?: TestimonialsBlock }) => {
  const { i18n } = useLingui();
  if (block?.show_section === false) return null;
  const engagements = block?.engagements?.length
    ? block.engagements.map((e) => ({ role: e.role ?? "", context: e.context ?? "", sketch: e.sketch ?? "" }))
    : DEFAULT_ENGAGEMENTS.map((e) => ({
        role: i18n._(e.role),
        context: i18n._(e.context),
        sketch: i18n._(e.sketch),
      }));

  // Tinted bloom: on /services this sits after the plain <Services/> section, so
  // the plain→tinted alternation avoids two plain sections' padding reading as
  // one oversized gap. Stacked padding keeps the gap to the Services CTA above
  // compact. Testimonials renders only on /services.
  return (
    <section id="testimonials" className={`${SECTION_PADDING_STACKED} bg-gradient-to-b from-background via-secondary/30 to-background`}>
      <div className="container px-6">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <div className={`text-center max-w-3xl mx-auto ${SECTION_HEADER_MARGIN} animate-fade-in-up`}>
            <h2 className="text-fluid-2xl font-bold mb-6">
              {block?.heading ?? <Trans>Typical Engagements</Trans>}
            </h2>
            <p className="text-fluid-lg text-muted-foreground">
              {block?.subheading ?? (
                <Trans>Three composite sketches — not client quotes — showing the problems leaders bring me and how the work tends to unfold</Trans>
              )}
            </p>
          </div>

          {/* Engagements grid */}
          <div className="grid md:grid-cols-3 gap-8">
            {engagements.map((engagement, index) => (
              <Card
                key={index}
                className={`p-8 hover-lift border-2 hover:border-accent/30 transition-all duration-300 animate-fade-in-up delay-${index * 100}`}
              >
                <div className="mb-6">
                  <p className="font-medium text-foreground">{engagement.role}</p>
                  <p className="text-sm text-muted-foreground">{engagement.context}</p>
                </div>

                <p className="text-foreground leading-relaxed">
                  {engagement.sketch}
                </p>
              </Card>
            ))}
          </div>

          {/* Confidentiality note */}
          <div className="mt-12 text-center">
            <p className="text-sm text-muted-foreground">
              {block?.note ?? (
                <Trans>Coaching conversations are confidential by default, so named endorsements will only ever appear here with a client's explicit sign-off.</Trans>
              )}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

import { Target, ShieldCheck, MessagesSquare, Wrench, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Trans, useLingui } from "@lingui/react/macro";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { resolveIcon } from "@/lib/storyblok-icons";
import type { PageBlock } from "@/lib/pages";
import { SECTION_HEADER_MARGIN, SECTION_PADDING_STACKED } from "@/lib/layout";

// Hardcoded fallback — also the seed source for Storyblok (see Philosophy.tsx).
const DEFAULT_VALUES: { icon: LucideIcon; title: MessageDescriptor; description: MessageDescriptor }[] = [
  {
    icon: Target,
    title: msg`Outcomes Over Optics`,
    description: msg`Every engagement names the result it should produce — delivery speed, retention, uptime — and we check that it did.`,
  },
  {
    icon: ShieldCheck,
    title: msg`Security by Default`,
    description: msg`Resilience and compliance as design inputs, not afterthoughts — a habit from years of PCI-DSS, SOC 2, and ISO 27001 work.`,
  },
  {
    icon: MessagesSquare,
    title: msg`Direct, Kind Feedback`,
    description: msg`You'll hear what I actually think, specifically and early. That candor is most of the value.`,
  },
  {
    icon: Wrench,
    title: msg`Practice Over Theory`,
    description: msg`I only teach what I've run in production with real teams — no borrowed frameworks.`,
  },
];

export interface ValueField {
  icon?: string;
  title?: string;
  description?: string;
}
export interface HowIWorkBlock extends PageBlock {
  heading?: string;
  values?: ValueField[];
}

export const HowIWork = ({ block }: { block?: HowIWorkBlock }) => {
  const { i18n } = useLingui();
  if (block?.show_section === false) return null;
  const cms = block?.values?.length ? block.values : null;
  const items = cms
    ? cms.map((v) => ({
        Icon: resolveIcon(v.icon, Target),
        title: v.title ?? "",
        description: v.description ?? "",
      }))
    : DEFAULT_VALUES.map((v) => ({
        Icon: v.icon,
        title: i18n._(v.title),
        description: i18n._(v.description),
      }));

  // Plain background: this closes the /philosophy page after the tinted
  // <Philosophy/> section, keeping the plain/tinted alternation. Stacked
  // padding: the top is halved so the gap to the previous section stays
  // compact (see SECTION_PADDING_STACKED).
  return (
    <section id="how-i-work" className={`${SECTION_PADDING_STACKED} bg-background`}>
      <div className="container px-6">
        <div className="max-w-6xl mx-auto">
          <div className={`text-center max-w-3xl mx-auto ${SECTION_HEADER_MARGIN} animate-fade-in-up`}>
            <h2 className="text-fluid-2xl font-bold">
              {block?.heading ?? <Trans>How I Work</Trans>}
            </h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {items.map((item, index) => (
              <Card
                key={index}
                className={`p-6 hover-lift border-2 hover:border-accent/50 transition-all duration-300 animate-fade-in-up delay-${index * 100}`}
              >
                <div className="mb-4">
                  <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                    <item.Icon className="w-6 h-6 text-accent" />
                  </div>
                </div>
                <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

import { Lightbulb, Cog, Heart, type LucideIcon } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { resolveIcon, resolveTheme } from "@/lib/storyblok-icons";
import type { PageBlock } from "@/lib/pages";
import { SECTION_HEADER_MARGIN, SECTION_PADDING } from "@/lib/layout";

// Hardcoded fallback — also the seed source for Storyblok. Rendered verbatim when
// no CMS block is supplied (tokenless build, or page not yet authored), so the
// design is byte-identical to before Storyblok. Icons/colors are the design's
// own; the CMS carries them as bounded enums resolved via storyblok-icons.
const DEFAULT_PILLARS: {
  icon: LucideIcon;
  title: MessageDescriptor;
  description: MessageDescriptor;
  color: string;
}[] = [
  {
    icon: Lightbulb,
    title: msg`Growth through Clarity`,
    description: msg`Clear goals, working feedback loops, and OKRs that tie each person's growth to business results — so your team knows exactly what winning looks like this quarter.`,
    color: "from-accent/20 to-accent/5",
  },
  {
    icon: Cog,
    title: msg`Empowerment through Systems`,
    description: msg`DevOps/GitOps workflows, DORA metrics, and decision frameworks that let your team move fast without waiting on you.`,
    color: "from-primary/20 to-primary/5",
  },
  {
    icon: Heart,
    title: msg`Leadership through Empathy`,
    description: msg`Psychological safety, deliberate mentoring, and a culture people choose to stay in. Retention is a leadership outcome, not an HR metric.`,
    color: "from-accent/20 to-accent/5",
  },
];

export interface PrincipleField {
  icon?: string;
  title?: string;
  description?: string;
  color?: string;
}
export interface PhilosophyBlock extends PageBlock {
  heading?: string;
  subheading?: string;
  principles?: PrincipleField[];
}

export const Philosophy = ({ block }: { block?: PhilosophyBlock }) => {
  const { i18n } = useLingui();
  if (block?.show_section === false) return null;
  // Resolve to one uniform item shape from EITHER the CMS block OR the hardcoded
  // defaults, so the JSX below renders once and is identical in both paths.
  const cms = block?.principles?.length ? block.principles : null;
  const items = cms
    ? cms.map((p) => ({
        Icon: resolveIcon(p.icon, Lightbulb),
        title: p.title ?? "",
        description: p.description ?? "",
        colorClass: resolveTheme(p.color),
      }))
    : DEFAULT_PILLARS.map((p) => ({
        Icon: p.icon,
        title: i18n._(p.title),
        description: i18n._(p.description),
        colorClass: p.color,
      }));

  return (
    <section id="philosophy" className={`${SECTION_PADDING} bg-gradient-to-b from-background via-secondary/30 to-background`}>
      <div className="container px-6">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <div className={`text-center max-w-3xl mx-auto ${SECTION_HEADER_MARGIN} animate-fade-in-up`}>
            <h1 className="text-fluid-3xl font-bold mb-6">
              {block?.heading ?? <Trans>My Coaching Philosophy</Trans>}
            </h1>
            <p className="text-fluid-lg text-muted-foreground">
              {block?.subheading ?? (
                <Trans>Three pillars behind every engagement — and what each one changes for your team</Trans>
              )}
            </p>
          </div>

          {/* Pillars */}
          <div className="space-y-8">
            {items.map((item, index) => (
              <div
                key={index}
                className={`group animate-fade-in-up delay-${index * 100}`}
              >
                <div className="relative">
                  {/* Connecting line (except for last item) */}
                  {index < items.length - 1 && (
                    <div className="absolute left-8 top-24 w-0.5 h-16 bg-gradient-to-b from-border to-transparent hidden md:block" />
                  )}

                  <div className="flex flex-col md:flex-row gap-6 md:gap-8 p-8 rounded-2xl bg-card border-2 border-border hover:border-accent/30 hover:shadow-lg transition-all duration-300">
                    {/* Icon */}
                    <div className="shrink-0">
                      <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${item.colorClass} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                        <item.Icon className="w-8 h-8 text-accent" strokeWidth={1.5} />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1">
                      <h2 className="text-fluid-xl font-bold mb-3 group-hover:text-accent transition-colors">
                        {item.title}
                      </h2>
                      <p className="text-fluid-base text-muted-foreground leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

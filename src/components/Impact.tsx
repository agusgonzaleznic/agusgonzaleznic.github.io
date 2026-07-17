import { Card } from "@/components/ui/card";
import { TrendingDown, Zap, Shield, Users, Rocket, Target, type LucideIcon } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { resolveIcon } from "@/lib/storyblok-icons";
import type { PageBlock } from "@/lib/pages";
import { SECTION_HEADER_MARGIN, SECTION_PADDING } from "@/lib/layout";

// Hardcoded fallback + seed source. `value` (e.g. "40%"), `period`, and
// `company` are deliberately NOT translated (locale-neutral / proper nouns) —
// the field-aware translator leaves them byte-identical across locales.
const DEFAULT_STATS: { icon: LucideIcon; value: string; label: MessageDescriptor; description: MessageDescriptor }[] = [
  { icon: TrendingDown, value: "40%", label: msg`Cloud Cost Reduction`, description: msg`FinOps discipline plus hard-nosed vendor negotiations — money back into the roadmap` },
  { icon: Shield, value: "99.99%", label: msg`System Uptime`, description: msg`Multi-region failover and DR/HA playbooks, built so a bad day in one region stays invisible to users` },
  { icon: Rocket, value: "3×", label: msg`Faster Releases`, description: msg`Trunk-based development, CI/CD, and GitOps — releasing became routine, not an event` },
  { icon: Zap, value: "75%", label: msg`Reduced Lead Time`, description: msg`A multi-account AWS migration with deployments automated end to end` },
  { icon: Users, value: "50%", label: msg`Team Velocity Boost`, description: msg`OKRs paired with DORA metrics, used as working tools rather than dashboards` },
  { icon: Target, value: "60%", label: msg`Faster Onboarding`, description: msg`Standardized processes and documentation a new hire can follow on day one` },
];

const DEFAULT_TIMELINE: { period: string; company: string; role: MessageDescriptor; achievement: MessageDescriptor }[] = [
  { period: "2025-Present", company: "Confidential (Web3)", role: msg`Head of Infrastructure & Security`, achievement: msg`Running infrastructure and security end to end for a Web3 platform — the company's name stays confidential for now.` },
  { period: "2022-2025", company: "JUCR GmbH (EV Charging)", role: msg`VP of Engineering`, achievement: msg`Led the migration to multi-account AWS, unified an architecture spanning 5+ SaaS services, and sustained 99.99% uptime.` },
  { period: "2020-2022", company: "Wildlife Studios (Gaming)", role: msg`Cloud Security Manager`, achievement: msg`Kept security controls stringent while game teams shipped features at full speed.` },
  { period: "2018-2021", company: "Ualá (FinTech)", role: msg`DevOps Lead`, achievement: msg`Delivered a core banking system on a fully serverless architecture, with PCI-DSS compliance and security hardening throughout.` },
  { period: "2014-2018", company: "Bdev (HealthTech)", role: msg`Infrastructure & Security Lead`, achievement: msg`Migrated on-premise infrastructure to AWS and implemented SOC 2 and ISO 27001 compliance.` },
];

export interface StatField {
  icon?: string;
  value?: string;
  label?: string;
  description?: string;
}
export interface TimelineField {
  period?: string;
  company?: string;
  role?: string;
  achievement?: string;
}
export interface ImpactBlock extends PageBlock {
  timeline_heading?: string;
  stats_heading?: string;
  stats_subheading?: string;
  timeline?: TimelineField[];
  stats?: StatField[];
}

export const Impact = ({ block }: { block?: ImpactBlock }) => {
  const { i18n } = useLingui();
  if (block?.show_section === false) return null;
  const timeline = block?.timeline?.length
    ? block.timeline.map((t) => ({ period: t.period ?? "", company: t.company ?? "", role: t.role ?? "", achievement: t.achievement ?? "" }))
    : DEFAULT_TIMELINE.map((t) => ({ period: t.period, company: t.company, role: i18n._(t.role), achievement: i18n._(t.achievement) }));
  const stats = block?.stats?.length
    ? block.stats.map((s) => ({ Icon: resolveIcon(s.icon, Target), value: s.value ?? "", label: s.label ?? "", description: s.description ?? "" }))
    : DEFAULT_STATS.map((s) => ({ Icon: s.icon, value: s.value, label: i18n._(s.label), description: i18n._(s.description) }));

  return (
    <section id="impact" className={`${SECTION_PADDING} bg-gradient-to-b from-background via-secondary/30 to-background`}>
      <div className="container px-6">
        <div className="max-w-6xl mx-auto">
          {/* Page header — the experience timeline leads the page */}
          <div className={`text-center max-w-3xl mx-auto ${SECTION_HEADER_MARGIN} animate-fade-in-up`}>
            <h1 className="text-fluid-3xl font-bold">
              {block?.timeline_heading ?? <Trans>Experience Timeline</Trans>}
            </h1>
          </div>

          {/* Timeline */}
          <div className="space-y-6">
            {timeline.map((item, index) => (
              <div
                key={item.period}
                className={`relative animate-fade-in-up delay-${index * 100}`}
              >
                {/* Connecting line */}
                {index < timeline.length - 1 && (
                  <div className="absolute left-4 md:left-24 top-12 w-0.5 h-full bg-gradient-to-b from-accent to-border" />
                )}

                <div className="flex flex-col md:flex-row gap-6 md:gap-8">
                  {/* Period badge */}
                  <div className="shrink-0 md:w-32">
                    <div className="inline-flex items-center justify-center px-4 py-2 rounded-full bg-accent/10 border border-accent/20">
                      <span className="text-sm font-medium text-accent">{item.period}</span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <Card className="p-6 border-2 hover:border-accent/30 hover-lift transition-all duration-300">
                      <div className="flex items-start gap-4">
                        <div className="w-2 h-2 rounded-full bg-accent mt-2 shrink-0" />
                        <div className="flex-1">
                          <div className="flex flex-col gap-1 mb-3">
                            {/* h2: peers of the Numbers section heading under the
                                page h1 — keeps the outline free of h1→h3 skips
                                (same pattern as the /philosophy pillar cards). */}
                            <h2 className="text-lg font-bold text-foreground">{item.role}</h2>
                            <p className="text-sm text-muted-foreground">{item.company}</p>
                          </div>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {item.achievement}
                          </p>
                        </div>
                      </div>
                    </Card>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Numbers — the internal pivot scales at md like every other gap
              (one SECTION_PADDING unit: 4rem/6rem). */}
          <div className={`mt-16 md:mt-24 text-center max-w-3xl mx-auto ${SECTION_HEADER_MARGIN} animate-fade-in-up`}>
            <h2 className="text-fluid-2xl font-bold mb-6">
              {block?.stats_heading ?? <Trans>Numbers I Stand Behind</Trans>}
            </h2>
            <p className="text-fluid-lg text-muted-foreground">
              {block?.stats_subheading ?? <Trans>Results from teams I've led as an operator — the same playbooks we'll work from</Trans>}
            </p>
          </div>

          {/* Stats grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {stats.map((stat, index) => (
              <Card
                key={index}
                className={`p-6 hover-lift border-2 hover:border-accent/30 transition-all duration-300 animate-fade-in-up delay-${index * 100}`}
              >
                <div className="flex items-start gap-4">
                  <div className="shrink-0 w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                    <stat.Icon className="w-6 h-6 text-accent" strokeWidth={2} />
                  </div>
                  <div className="flex-1">
                    <div className="text-3xl font-bold text-accent mb-1">{stat.value}</div>
                    <div className="text-sm font-medium text-foreground mb-2">{stat.label}</div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {stat.description}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

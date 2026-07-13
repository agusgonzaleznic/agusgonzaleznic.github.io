import { Card } from "@/components/ui/card";
import { Target, ShieldCheck, MessagesSquare, Wrench } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { msg } from "@lingui/core/macro";
import { SECTION_HEADER_MARGIN, SECTION_PADDING } from "@/lib/layout";

const values = [
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

export const About = () => {
  const { i18n } = useLingui();
  return (
    <section id="about" className={`${SECTION_PADDING} bg-background`}>
      <div className="container px-6">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <div className={`text-center max-w-3xl mx-auto ${SECTION_HEADER_MARGIN} animate-fade-in-up`}>
            <h2 className="text-fluid-3xl font-bold mb-6">
              <Trans>From Haedo to Berlin, One Engineering Team at a Time</Trans>
            </h2>
            <p className="text-fluid-lg text-muted-foreground leading-relaxed mb-6">
              <Trans>I'm Agustin Gonzalez Nicolini. For 15+ years I've built and led multi-disciplinary teams across fintech, gaming, e-mobility, healthtech, and web3 — shipping REST and GraphQL architectures on serverless and containerized cloud-native systems, including a core banking platform.</Trans>
            </p>
            <p className="text-fluid-lg text-muted-foreground leading-relaxed">
              <Trans>I advise C-suite and senior engineering leaders on cloud-native systems, DevOps transformation, and security — and I've likely sat through a version of whatever you're facing: the reorg, the audit, the outage review, the budget fight. Whether you're taking a startup through scale-up or restoring delivery discipline in an enterprise org, we build the systems and habits that let your team deliver without you as the bottleneck.</Trans>
            </p>
          </div>

          {/* Values grid */}
          <div>
            <h3 className="text-fluid-xl font-bold mb-8 text-center"><Trans>How I Work</Trans></h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {values.map((value, index) => (
                <Card
                  key={index}
                  className={`p-6 hover-lift border-2 hover:border-accent/50 transition-all duration-300 animate-fade-in-up delay-${index * 100}`}
                >
                  <div className="mb-4">
                    <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                      <value.icon className="w-6 h-6 text-accent" />
                    </div>
                  </div>
                  <h4 className="text-lg font-bold mb-2">{i18n._(value.title)}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {i18n._(value.description)}
                  </p>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

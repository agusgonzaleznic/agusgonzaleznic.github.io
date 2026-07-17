import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, ArrowRight } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { msg } from "@lingui/core/macro";
import { SECTION_HEADER_MARGIN, SECTION_PADDING } from "@/lib/layout";

const services = [
  {
    title: msg`Executive Leadership Coaching`,
    subtitle: msg`CTO & VP Level`,
    description: msg`For leaders accountable to boards and founders: an org design that scales, stakeholders who trust you, and decisions you can defend under pressure.`,
    features: [
      msg`Stakeholder influence & C-suite communication`,
      msg`Organization design & scaling strategies`,
      msg`Technology roadmap alignment with business goals`,
      msg`Board presentations & executive presence`,
      msg`Vendor management & strategic partnerships`,
    ],
    format: msg`Bi-weekly 60-minute sessions`,
    bestFor: msg`CTOs, VPs, and senior engineering executives`,
  },
  {
    title: msg`Team & Manager Coaching`,
    subtitle: msg`Manager & Director Level`,
    description: msg`For managers whose teams should be shipping more than they are: better delivery numbers, healthier rituals, and calmer on-call weeks.`,
    features: [
      msg`DORA metrics & deployment velocity optimization`,
      msg`Team rituals, retrospectives & continuous improvement`,
      msg`Hiring, leveling & performance frameworks`,
      msg`Incident readiness & on-call culture`,
      msg`DevOps/GitOps workflows & trunk-based development`,
    ],
    format: msg`Weekly or bi-weekly 45-minute sessions`,
    bestFor: msg`Engineering managers, directors, and team leads`,
    featured: true,
  },
  {
    title: msg`Career Transition Coaching`,
    subtitle: msg`IC to Manager & Beyond`,
    description: msg`For engineers and managers moving up a level: land the role, then grow into it faster than you would alone.`,
    features: [
      msg`IC → Manager: First-time leadership transitions`,
      msg`Manager → Director: Scaling impact through others`,
      msg`Director → VP: Strategic thinking & executive presence`,
      msg`Career clarity & personal brand development`,
      msg`Interview prep for leadership roles`,
    ],
    format: msg`8-12 week programs with weekly check-ins`,
    bestFor: msg`Engineers and managers at career inflection points`,
  },
];

export const Services = () => {
  const { i18n } = useLingui();
  const handleContact = () => {
    window.open("https://calendar.app.google/kFaanhSae5WefLnD7", "_blank");
  };

  return (
    <section id="services" className={`${SECTION_PADDING} bg-background`}>
      <div className="container px-6">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <div className={`text-center max-w-3xl mx-auto ${SECTION_HEADER_MARGIN} animate-fade-in-up`}>
            <h1 className="text-fluid-3xl font-bold mb-6"><Trans>Coaching Services</Trans></h1>
            <p className="text-fluid-lg text-muted-foreground">
              <Trans>Three formats. Pick by the problem you have, not the title you hold.</Trans>
            </p>
          </div>

          {/* Services grid */}
          <div className="grid lg:grid-cols-3 gap-8">
            {services.map((service, index) => (
              <Card
                key={index}
                className={`p-8 hover-lift transition-all duration-300 animate-fade-in-up delay-${index * 100} ${
                  service.featured
                    ? "border-2 border-accent shadow-accent relative"
                    : "border-2 hover:border-accent/30"
                }`}
              >
                {service.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-block px-4 py-1 bg-accent text-accent-foreground text-sm font-medium rounded-full">
                      <Trans>Most Popular</Trans>
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h2 className="text-2xl font-bold mb-2">{i18n._(service.title)}</h2>
                  <p className="text-sm text-accent font-medium">{i18n._(service.subtitle)}</p>
                </div>

                <p className="text-muted-foreground mb-6 leading-relaxed">
                  {i18n._(service.description)}
                </p>

                <div className="mb-6 space-y-3">
                  {service.features.map((feature, featureIndex) => (
                    <div key={featureIndex} className="flex items-start gap-3">
                      <div className="shrink-0 w-5 h-5 rounded-full bg-accent/10 flex items-center justify-center mt-0.5">
                        <Check className="w-3 h-3 text-accent" strokeWidth={3} />
                      </div>
                      <span className="text-sm text-foreground">{i18n._(feature)}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-6 border-t border-border space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1"><Trans>Format</Trans></p>
                    <p className="text-sm font-medium">{i18n._(service.format)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1"><Trans>Best for</Trans></p>
                    <p className="text-sm font-medium">{i18n._(service.bestFor)}</p>
                  </div>
                  <Button
                    onClick={handleContact}
                    className={
                      service.featured
                        ? "w-full bg-accent hover:bg-accent-hover text-accent-foreground"
                        : "w-full"
                    }
                    variant={service.featured ? "default" : "outline"}
                  >
                    <Trans>Get Started</Trans>
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          {/* Bottom CTA */}
          <div className="mt-16 text-center">
            <p className="text-muted-foreground mb-4">
              <Trans>Not sure which format fits your situation?</Trans>
            </p>
            <Button onClick={handleContact} size="lg" variant="outline">
              <Trans>Book an Intro Call</Trans>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

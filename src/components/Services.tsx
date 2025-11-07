import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, ArrowRight } from "lucide-react";

const services = [
  {
    title: "Executive Leadership Coaching",
    subtitle: "CTO & VP Level",
    description:
      "Strategic partnership for C-suite leaders navigating complex technical and organizational challenges.",
    features: [
      "Stakeholder influence & C-suite communication",
      "Organization design & scaling strategies",
      "Technology roadmap alignment with business goals",
      "Board presentations & executive presence",
      "Vendor management & strategic partnerships",
    ],
    format: "Bi-weekly 60-minute sessions",
    bestFor: "CTOs, VPs, and senior engineering executives",
  },
  {
    title: "Team & Manager Coaching",
    subtitle: "Manager & Director Level",
    description:
      "Build high-performing teams that ship reliably, move fast, and continuously improve.",
    features: [
      "DORA metrics & deployment velocity optimization",
      "Team rituals, retrospectives & continuous improvement",
      "Hiring, leveling & performance frameworks",
      "Incident readiness & on-call culture",
      "DevOps/GitOps workflows & trunk-based development",
    ],
    format: "Weekly or bi-weekly 45-minute sessions",
    bestFor: "Engineering managers, directors, and team leads",
    featured: true,
  },
  {
    title: "Career Transition Coaching",
    subtitle: "IC to Manager & Beyond",
    description:
      "Navigate critical career transitions with confidence, clarity, and a clear roadmap.",
    features: [
      "IC → Manager: First-time leadership transitions",
      "Manager → Director: Scaling impact through others",
      "Director → VP: Strategic thinking & executive presence",
      "Career clarity & personal brand development",
      "Interview prep for leadership roles",
    ],
    format: "8-12 week programs with weekly check-ins",
    bestFor: "Engineers and managers at career inflection points",
  },
];

export const Services = () => {
  const handleContact = () => {
    window.open("https://calendar.app.google/kFaanhSae5WefLnD7", "_blank");
  };

  return (
    <section id="services" className="py-24 md:py-32 bg-background">
      <div className="container px-6">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <div className="text-center max-w-3xl mx-auto mb-16 animate-fade-in-up">
            <h2 className="text-fluid-3xl font-bold mb-6">Coaching Services</h2>
            <p className="text-fluid-lg text-muted-foreground">
              Tailored coaching programs designed for engineering leaders at every stage of their journey
            </p>
          </div>

          {/* Services grid */}
          <div className="grid lg:grid-cols-3 gap-8">
            {services.map((service, index) => (
              <Card
                key={service.title}
                className={`p-8 hover-lift transition-all duration-300 animate-fade-in-up delay-${index * 100} ${
                  service.featured
                    ? "border-2 border-accent shadow-accent relative"
                    : "border-2 hover:border-accent/30"
                }`}
              >
                {service.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-block px-4 py-1 bg-accent text-accent-foreground text-sm font-semibold rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-2xl font-bold mb-2">{service.title}</h3>
                  <p className="text-sm text-accent font-semibold">{service.subtitle}</p>
                </div>

                <p className="text-muted-foreground mb-6 leading-relaxed">
                  {service.description}
                </p>

                <div className="mb-6 space-y-3">
                  {service.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-3">
                      <div className="shrink-0 w-5 h-5 rounded-full bg-accent/10 flex items-center justify-center mt-0.5">
                        <Check className="w-3 h-3 text-accent" strokeWidth={3} />
                      </div>
                      <span className="text-sm text-foreground">{feature}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-6 border-t border-border space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Format</p>
                    <p className="text-sm font-medium">{service.format}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Best for</p>
                    <p className="text-sm font-medium">{service.bestFor}</p>
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
                    Get Started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          {/* Bottom CTA */}
          <div className="mt-16 text-center">
            <p className="text-muted-foreground mb-4">
              Not sure which program is right for you?
            </p>
            <Button onClick={handleContact} size="lg" variant="outline">
              Schedule a Free Discovery Call
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

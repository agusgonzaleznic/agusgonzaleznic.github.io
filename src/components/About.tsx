import { Card } from "@/components/ui/card";
import { Target, ShieldCheck, MessagesSquare, Wrench } from "lucide-react";
import { SECTION_HEADER_MARGIN, SECTION_PADDING } from "@/lib/layout";

const values = [
  {
    icon: Target,
    title: "Outcomes Over Optics",
    description: "Every engagement names the result it should produce — delivery speed, retention, uptime — and we check that it did.",
  },
  {
    icon: ShieldCheck,
    title: "Security by Default",
    description: "Resilience and compliance as design inputs, not afterthoughts — a habit from years of PCI-DSS, SOC 2, and ISO 27001 work.",
  },
  {
    icon: MessagesSquare,
    title: "Direct, Kind Feedback",
    description: "You'll hear what I actually think, specifically and early. That candor is most of the value.",
  },
  {
    icon: Wrench,
    title: "Practice Over Theory",
    description: "I only teach what I've run in production with real teams — no borrowed frameworks.",
  },
];

export const About = () => {
  return (
    <section id="about" className={`${SECTION_PADDING} bg-background`}>
      <div className="container px-6">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <div className={`max-w-3xl ${SECTION_HEADER_MARGIN} animate-fade-in-up`}>
            <h2 className="text-fluid-3xl font-bold mb-6">
              From Haedo to Berlin, One Engineering Team at a Time
            </h2>
            <p className="text-fluid-lg text-muted-foreground leading-relaxed mb-6">
              I'm Agustin Gonzalez Nicolini. For 15+ years I've built and led multi-disciplinary teams across fintech, gaming, e-mobility, and healthtech — shipping REST and GraphQL architectures on serverless and containerized cloud-native systems, including a core banking platform.
            </p>
            <p className="text-fluid-lg text-muted-foreground leading-relaxed">
              I advise C-suite and senior engineering leaders on cloud-native systems, DevOps transformation, and security — and I've likely sat through a version of whatever you're facing: the reorg, the audit, the outage review, the budget fight. Whether you're taking a startup through scale-up or restoring delivery discipline in an enterprise org, we build the systems and habits that let your team deliver without you as the bottleneck.
            </p>
          </div>

          {/* Values grid */}
          <div>
            <h3 className="text-fluid-xl font-bold mb-8 text-center">How I Work</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {values.map((value, index) => (
                <Card
                  key={value.title}
                  className={`p-6 hover-lift border-2 hover:border-accent/50 transition-all duration-300 animate-fade-in-up delay-${index * 100}`}
                >
                  <div className="mb-4">
                    <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                      <value.icon className="w-6 h-6 text-accent" />
                    </div>
                  </div>
                  <h4 className="text-lg font-bold mb-2">{value.title}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {value.description}
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

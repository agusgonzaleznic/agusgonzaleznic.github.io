import { Card } from "@/components/ui/card";
import { TrendingDown, Zap, Shield, Users, Rocket, Target } from "lucide-react";

const stats = [
  {
    icon: TrendingDown,
    value: "40%",
    label: "Cloud Cost Reduction",
    description: "Through FinOps best practices and strategic vendor negotiations",
  },
  {
    icon: Shield,
    value: "99.99%",
    label: "System Uptime",
    description: "Via DR/HA playbooks and multi-region failover strategies",
  },
  {
    icon: Rocket,
    value: "3×",
    label: "Faster Releases",
    description: "With trunk-based DevOps, CI/CD, and GitOps workflows",
  },
  {
    icon: Zap,
    value: "75%",
    label: "Reduced Lead Time",
    description: "By migrating to multi-account AWS and automated deployments",
  },
  {
    icon: Users,
    value: "50%",
    label: "Team Velocity Boost",
    description: "Through OKRs framework and DORA metrics implementation",
  },
  {
    icon: Target,
    value: "60%",
    label: "Faster Onboarding",
    description: "With standardized processes and comprehensive documentation",
  },
];

const timeline = [
  {
    period: "2022-2025",
    company: "JUCR GmbH (EV Charging)",
    role: "VP of Engineering",
    achievement: "Led migration to multi-account AWS, orchestrated an architecture across 5+ SaaS Services, achieved 99.99% uptime",
  },
  {
    period: "2020-2022",
    company: "Wildlife Studios (Gaming)",
    role: "Cloud Security Manager",
    achievement: "Balancing rapid feature delivery with stringent security controls.",
  },
  {
    period: "2018-2021",
    company: "Ualá (FinTech)",
    role: "DevOps Lead",
    achievement: "Core banking system delivery; PCI-DSS compliance and security hardening, full serverless architecture",
  },
  {
    period: "2014-2018",
    company: "Bdev (HealthTech)",
    role: "Infrastructure & Security Lead",
    achievement: "Migrated on-premise to AWS; implemented SOC 2 & ISO 27001 compliance",
  },
];

export const Impact = () => {
  return (
    <section id="impact" className="py-24 md:py-32 bg-gradient-to-b from-background to-secondary/30">
      <div className="container px-6">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <div className="text-center max-w-3xl mx-auto mb-16 animate-fade-in-up">
            <h2 className="text-fluid-3xl font-bold mb-6">Proven Impact & Results</h2>
            <p className="text-fluid-lg text-muted-foreground">
              Measurable outcomes from 15+ years leading engineering teams
            </p>
          </div>

          {/* Stats grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-20">
            {stats.map((stat, index) => (
              <Card
                key={stat.label}
                className={`p-6 hover-lift border-2 hover:border-accent/30 transition-all duration-300 animate-fade-in-up delay-${index * 100}`}
              >
                <div className="flex items-start gap-4">
                  <div className="shrink-0 w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                    <stat.icon className="w-6 h-6 text-accent" strokeWidth={2} />
                  </div>
                  <div className="flex-1">
                    <div className="text-3xl font-bold text-accent mb-1">{stat.value}</div>
                    <div className="text-sm font-semibold text-foreground mb-2">{stat.label}</div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {stat.description}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Timeline */}
          <div>
            <h3 className="text-fluid-2xl font-bold text-center mb-12 animate-fade-in-up">
              Experience Timeline
            </h3>
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
                        <span className="text-sm font-semibold text-accent">{item.period}</span>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1">
                      <Card className="p-6 border-2 hover:border-accent/30 hover-lift transition-all duration-300">
                        <div className="flex items-start gap-4">
                          <div className="w-2 h-2 rounded-full bg-accent mt-2 shrink-0" />
                          <div className="flex-1">
                            <div className="flex flex-col gap-1 mb-3">
                              <h4 className="text-lg font-bold text-foreground">{item.role}</h4>
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
          </div>
        </div>
      </div>
    </section>
  );
};

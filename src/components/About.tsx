import { Card } from "@/components/ui/card";
import { Target, Users, Shield, TrendingUp } from "lucide-react";

const values = [
  {
    icon: Target,
    title: "Empowerment",
    description: "Building autonomous teams that take ownership and drive results",
  },
  {
    icon: TrendingUp,
    title: "Systems Thinking",
    description: "Creating scalable processes that enable sustainable growth",
  },
  {
    icon: Shield,
    title: "Security Mindset",
    description: "Building resilient systems with compliance and best practices baked in",
  },
  {
    icon: Users,
    title: "Continuous Improvement",
    description: "Fostering cultures of learning, feedback, and excellence",
  },
];

export const About = () => {
  return (
    <section id="about" className="py-24 md:py-32 bg-background">
      <div className="container px-6">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <div className="max-w-3xl mb-16 animate-fade-in-up">
            <h2 className="text-fluid-3xl font-bold mb-6">
              Your Trusted Advisor for Engineering Leadership
            </h2>
            <p className="text-fluid-lg text-muted-foreground leading-relaxed mb-6">
              As a VP of Engineering with over 15 years of experience, I've led multi-disciplinary teams across fintech, gaming, e-mobility, and media — delivering core banking systems, serverless threat detection, and EV charging infrastructure.
            </p>
            <p className="text-fluid-lg text-muted-foreground leading-relaxed">
              I'm a trusted advisor to C-suite leaders, specializing in cloud infrastructure, DevOps transformation, and security. Whether you're scaling from startup to scale-up or optimizing enterprise operations, I help you build systems and cultures that deliver results while empowering your team.
            </p>
          </div>

          {/* Values grid */}
          <div>
            <h3 className="text-fluid-xl font-semibold mb-8 text-center">Core Values</h3>
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
                  <h4 className="text-lg font-semibold mb-2">{value.title}</h4>
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

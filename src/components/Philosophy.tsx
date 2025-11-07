import { Lightbulb, Cog, Heart } from "lucide-react";

const pillars = [
  {
    icon: Lightbulb,
    title: "Growth through Clarity",
    description:
      "Set clear goals, establish feedback loops, and implement OKRs that align individual growth with organizational success. Cut through the noise to focus on what matters.",
    color: "from-accent/20 to-accent/5",
  },
  {
    icon: Cog,
    title: "Empowerment through Systems",
    description:
      "Build DevOps/GitOps workflows, implement DORA metrics, and create decision frameworks that enable teams to move fast with confidence and autonomy.",
    color: "from-primary/20 to-primary/5",
  },
  {
    icon: Heart,
    title: "Leadership through Empathy",
    description:
      "Foster psychological safety, mentor with intention, and build cultures where people thrive. Great engineering starts with great teams.",
    color: "from-accent/20 to-accent/5",
  },
];

export const Philosophy = () => {
  return (
    <section id="philosophy" className="py-24 md:py-32 bg-gradient-to-b from-background to-secondary/30">
      <div className="container px-6">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <div className="text-center max-w-3xl mx-auto mb-16 animate-fade-in-up">
            <h2 className="text-fluid-3xl font-bold mb-6">My Coaching Philosophy</h2>
            <p className="text-fluid-lg text-muted-foreground">
              Three interconnected pillars that transform good leaders into exceptional ones
            </p>
          </div>

          {/* Pillars */}
          <div className="space-y-8">
            {pillars.map((pillar, index) => (
              <div
                key={pillar.title}
                className={`group animate-fade-in-up delay-${index * 100}`}
              >
                <div className="relative">
                  {/* Connecting line (except for last item) */}
                  {index < pillars.length - 1 && (
                    <div className="absolute left-8 top-24 w-0.5 h-16 bg-gradient-to-b from-border to-transparent hidden md:block" />
                  )}

                  <div className="flex flex-col md:flex-row gap-6 md:gap-8 p-8 rounded-2xl bg-card border-2 border-border hover:border-accent/30 hover:shadow-lg transition-all duration-300">
                    {/* Icon */}
                    <div className="shrink-0">
                      <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${pillar.color} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                        <pillar.icon className="w-8 h-8 text-accent" strokeWidth={1.5} />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1">
                      <h3 className="text-fluid-xl font-semibold mb-3 group-hover:text-accent transition-colors">
                        {pillar.title}
                      </h3>
                      <p className="text-fluid-base text-muted-foreground leading-relaxed">
                        {pillar.description}
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

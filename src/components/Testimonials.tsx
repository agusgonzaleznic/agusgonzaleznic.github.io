import { Card } from "@/components/ui/card";

// Composite scenarios, not client quotes — coaching is confidential, and real
// endorsements will only ever appear with a client's explicit sign-off.
const engagements = [
  {
    role: "Senior Engineering Manager",
    context: "FinTech scale-up",
    sketch:
      "The first call was about messy deploys. Within six months the pipeline was boring — in the best way — but the more useful work was getting them out of the middle of every decision their team makes.",
  },
  {
    role: "First-Time Engineering Manager",
    context: "E-Commerce Platform",
    sketch:
      "A few months into the role and drowning. Instead of handing over a framework, we rehearsed the conversations they were avoiding — delegation, feedback, saying no — until having them for real felt routine.",
  },
  {
    role: "VP of Engineering",
    context: "B2B SaaS Company",
    sketch:
      "One team became four in a year and everything got slower — it usually does. We sketched an org structure early on, then stress-tested and adjusted it over the following quarters as the company kept growing.",
  },
];

export const Testimonials = () => {
  return (
    <section id="testimonials" className="py-24 md:py-32 bg-background">
      <div className="container px-6">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <div className="text-center max-w-3xl mx-auto mb-16 animate-fade-in-up">
            <h2 className="text-fluid-3xl font-bold mb-6">Typical Engagements</h2>
            <p className="text-fluid-lg text-muted-foreground">
              Three composite sketches — not client quotes — showing the problems leaders bring me and how the work tends to unfold
            </p>
          </div>

          {/* Engagements grid */}
          <div className="grid md:grid-cols-3 gap-8">
            {engagements.map((engagement, index) => (
              <Card
                key={engagement.role}
                className={`p-8 hover-lift border-2 hover:border-accent/30 transition-all duration-300 animate-fade-in-up delay-${index * 100}`}
              >
                <div className="mb-6">
                  <p className="font-semibold text-foreground">{engagement.role}</p>
                  <p className="text-sm text-muted-foreground">{engagement.context}</p>
                </div>

                <p className="text-foreground leading-relaxed">
                  {engagement.sketch}
                </p>
              </Card>
            ))}
          </div>

          {/* Confidentiality note */}
          <div className="mt-12 text-center">
            <p className="text-sm text-muted-foreground">
              Coaching conversations are confidential by default, so named endorsements will only ever appear here with a client's explicit sign-off.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

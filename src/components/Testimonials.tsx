import { Card } from "@/components/ui/card";
import { Quote } from "lucide-react";

const testimonials = [
  {
    quote:
      "Working with Agustin transformed how I approach leadership. His systems thinking helped us reduce deployment times by 70% while building a culture of ownership and continuous improvement.",
    author: "Senior Engineering Manager",
    role: "FinTech Scale-up",
    initials: "SM",
  },
  {
    quote:
      "Agustin's coaching gave me the clarity and confidence to transition from IC to manager. His frameworks for feedback, delegation, and team rituals were game-changers for my career.",
    author: "Engineering Manager",
    role: "E-Commerce Platform",
    initials: "EM",
  },
  {
    quote:
      "As a VP scaling from 20 to 100+ engineers, Agustin's guidance on org design, metrics, and stakeholder management was invaluable. His experience shows in every conversation.",
    author: "VP of Engineering",
    role: "B2B SaaS Company",
    initials: "VP",
  },
];

export const Testimonials = () => {
  return (
    <section id="testimonials" className="py-24 md:py-32 bg-background">
      <div className="container px-6">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <div className="text-center max-w-3xl mx-auto mb-16 animate-fade-in-up">
            <h2 className="text-fluid-3xl font-bold mb-6">What Leaders Say</h2>
            <p className="text-fluid-lg text-muted-foreground">
              Real impact from engineering leaders who've worked with me
            </p>
          </div>

          {/* Testimonials grid */}
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <Card
                key={index}
                className={`p-8 hover-lift border-2 hover:border-accent/30 transition-all duration-300 animate-fade-in-up delay-${index * 100} relative`}
              >
                {/* Quote icon */}
                <div className="absolute -top-4 left-8 w-12 h-12 rounded-full bg-accent flex items-center justify-center shadow-md">
                  <Quote className="w-6 h-6 text-accent-foreground" fill="currentColor" />
                </div>

                <div className="pt-6">
                  <p className="text-foreground/90 leading-relaxed mb-8 italic">
                    "{testimonial.quote}"
                  </p>

                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center text-accent-foreground font-bold">
                      {testimonial.initials}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{testimonial.author}</p>
                      <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Note about placeholders */}
          <div className="mt-12 text-center">
            <p className="text-sm text-muted-foreground italic">
              Testimonials are representative samples. Client confidentiality is always maintained.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import profileImage from "@/assets/profile.jpg";

export const Hero = () => {
  const handleBooking = () => {
    window.open("https://calendar.app.google/kFaanhSae5WefLnD7", "_blank");
  };

  const scrollToServices = () => {
    document.getElementById("services")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-b from-background to-secondary/30">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-48 w-96 h-96 bg-accent/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 -right-48 w-96 h-96 bg-accent/5 rounded-full blur-3xl animate-pulse delay-300" />
      </div>

      <div className="container relative z-10 px-6 py-20 md:py-32">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Content */}
            <div className="space-y-8 animate-fade-in-up">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 rounded-full border border-accent/20">
                <Sparkles className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium text-foreground">15+ years leading engineering teams</span>
              </div>

              <h1 className="text-fluid-4xl font-bold leading-tight">
                Empowering Engineering Leaders to{" "}
                <span className="text-gradient-accent relative">
                  Build, Grow, and Inspire
                  <svg
                    className="absolute -bottom-2 left-0 w-full"
                    height="8"
                    viewBox="0 0 200 8"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M0 4C50 2 150 2 200 4"
                      stroke="url(#gradient)"
                      strokeWidth="3"
                      fill="none"
                      strokeLinecap="round"
                    />
                    <defs>
                      <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="hsl(10, 85%, 58%)" />
                        <stop offset="100%" stopColor="hsl(20, 80%, 65%)" />
                      </linearGradient>
                    </defs>
                  </svg>
                </span>
              </h1>

              <p className="text-fluid-lg text-muted-foreground leading-relaxed">
                I coach CTOs, VPs, managers, and tech leads to scale teams, ship faster, and lead with confidence across fintech, gaming, and e-mobility.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Button
                  size="lg"
                  onClick={handleBooking}
                  className="bg-accent hover:bg-accent-hover text-accent-foreground shadow-accent hover:shadow-lg transition-all duration-300 group"
                >
                  Book a Session
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={scrollToServices}
                  className="border-2 hover:bg-secondary"
                >
                  How Coaching Works
                </Button>
              </div>

              <div className="pt-8 border-t border-border">
                <p className="text-sm text-muted-foreground mb-3">Trusted by engineering leaders at:</p>
                <div className="flex flex-wrap gap-4 text-sm font-medium text-foreground/60">
                  <span>Fintech</span>
                  <span>•</span>
                  <span>Gaming</span>
                  <span>•</span>
                  <span>E-Mobility</span>
                  <span>•</span>
                  <span>HealthTech</span>
                </div>
              </div>
            </div>

            {/* Profile Image */}
            <div className="relative animate-fade-in delay-200">
              <div className="relative aspect-square max-w-lg mx-auto">
                {/* Glow effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-accent/20 to-accent/5 rounded-3xl blur-2xl" />
                
                {/* Image container */}
                <div className="relative rounded-3xl overflow-hidden shadow-2xl hover-lift">
                  <img
                    src={profileImage}
                    alt="Agustin Gonzalez Nicolini - Engineering Leadership Coach"
                    className="w-full h-full object-cover"
                    loading="eager"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-primary/20 to-transparent" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <div className="w-6 h-10 border-2 border-muted-foreground/30 rounded-full p-1">
          <div className="w-1.5 h-3 bg-accent rounded-full mx-auto animate-pulse" />
        </div>
      </div>
    </section>
  );
};

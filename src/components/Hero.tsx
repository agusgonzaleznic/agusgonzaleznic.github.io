import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import profileImage from "@/assets/profile.jpg";
import { HERO_CTA_ID, SECTION_PADDING } from "@/lib/layout";

export const Hero = () => {
  const { t } = useLingui();
  const handleBooking = () => {
    window.open("https://calendar.app.google/kFaanhSae5WefLnD7", "_blank");
  };

  const scrollToServices = () => {
    document.getElementById("services")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-b from-background via-secondary/30 to-background">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-48 w-96 h-96 bg-accent/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 -right-48 w-96 h-96 bg-accent/5 rounded-full blur-3xl animate-pulse delay-300" />
      </div>

      <div className={`container relative z-10 px-6 ${SECTION_PADDING}`}>
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Content */}
            <div className="space-y-8 animate-fade-in-up">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 rounded-full border border-accent/20">
                <Sparkles className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium text-foreground"><Trans>15+ years leading engineering teams</Trans></span>
              </div>

              <h1 className="text-fluid-4xl font-bold leading-tight">
                <Trans>
                  Lead an Engineering Org That{" "}
                  <span className="text-gradient-accent">
                    Ships, Scales,{" "}
                    {/* Underline scoped to "and Lasts" (nowrap keeps the pair on
                        one line) so mobile and desktop render it identically —
                        previously the absolute SVG anchored to the span's last
                        line box, underlining the whole phrase on desktop. */}
                    <span className="relative whitespace-nowrap">
                      and Lasts
                      <svg
                        className="absolute -bottom-2 left-0 w-full"
                        height="8"
                        viewBox="0 0 200 8"
                        preserveAspectRatio="none"
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
                  </span>
                </Trans>
              </h1>

              <p className="text-fluid-lg text-muted-foreground leading-relaxed">
                <Trans>One-on-one coaching for senior engineering leaders, from first-time managers to CTOs. We work on what you're measured by: delivery, retention, and an org that runs without heroics.</Trans>
              </p>

              <div id={HERO_CTA_ID} className="flex flex-col sm:flex-row gap-4 pt-4">
                <Button
                  size="lg"
                  onClick={handleBooking}
                  className="bg-accent hover:bg-accent-hover text-accent-foreground shadow-accent hover:shadow-lg transition-all duration-300 group"
                >
                  <Trans>Book a Session</Trans>
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={scrollToServices}
                  className="border-2 hover:bg-secondary"
                >
                  <Trans>How Coaching Works</Trans>
                </Button>
              </div>

              <div className="pt-8 border-t border-border">
                <p className="text-sm text-muted-foreground mb-3"><Trans>Industries where I've led teams:</Trans></p>
                <div className="flex flex-wrap gap-4 text-sm font-medium text-muted-foreground">
                  <span>Fintech</span>
                  <span>•</span>
                  <span>Gaming</span>
                  <span>•</span>
                  <span>E-Mobility</span>
                  <span>•</span>
                  <span>HealthTech</span>
                  <span>•</span>
                  <span>Web3</span>
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
                    alt={t`Agustin Gonzalez Nicolini - Engineering Leadership Coach`}
                    className="w-full h-full object-cover"
                    loading="eager"
                    // React 18 only forwards the lowercase spelling ("fetchPriority"
                    // is dropped with a warning until React 19); spread keeps tsc happy.
                    {...{ fetchpriority: "high" }}
                    width="512"
                    height="512"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-primary/20 to-transparent" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator — desktop only; on the stacked mobile layout it
          crowds the profile image and adds nothing. */}
      <div className="hidden md:block absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <div className="w-6 h-10 border-2 border-muted-foreground/30 rounded-full p-1">
          <div className="w-1.5 h-3 bg-accent rounded-full mx-auto animate-pulse" />
        </div>
      </div>
    </section>
  );
};

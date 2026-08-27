import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Trans, useLingui } from "@lingui/react/macro";
import profileImage from "@/assets/profile.jpg";
import { LocaleLink } from "@/components/LocaleLink";
import type { PageBlock } from "@/lib/pages";
import { SECTION_HEADER_MARGIN, SECTION_PADDING } from "@/lib/layout";

// The H1 stays in code (a single headline with load-bearing inline emphasis
// spans + underline-squiggle, translated as ONE reorderable unit via <Trans> —
// decomposing it into CMS fields would break the exact non-English rendering).
// Everything else in the hero is CMS-managed. Industries are NOT translated
// (loanword-ish labels, identical in every locale).
const DEFAULT_INDUSTRIES = ["Fintech", "Gaming", "E-Mobility", "HealthTech", "Web3"];

export interface HeroBlock extends PageBlock {
  badge?: string;
  subheading?: string;
  cta_text?: string;
  industries_label?: string;
  industries?: string;
  image_alt?: string;
}

export const Hero = ({ block }: { block?: HeroBlock }) => {
  const { t } = useLingui();
  if (block?.show_section === false) return null;
  const industries = block?.industries
    ? block.industries.split("\n").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_INDUSTRIES;

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-b from-background via-secondary/30 to-background">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-48 w-96 h-96 bg-accent/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 -right-48 w-96 h-96 bg-accent/5 rounded-full blur-3xl animate-pulse delay-300" />
      </div>

      <div className={`container relative z-10 px-6 ${SECTION_PADDING}`}>
        <div className="max-w-6xl mx-auto">
          {/* Running head. The credential is the masthead line of the page, set
              over a thick-thin (Scotch) rule that spans BOTH grid columns, so
              the rule is the top edge of the whole composition instead of a chip
              inside the text column. Both columns now start under it, so
              items-start aligns the H1's first line with the top of the photo on
              its own and the image column's hardcoded 70px top offset is gone
              (spelling that class here would be enough for Tailwind's text
              scanner to regenerate the rule, so it is described, not named).
              Inter 500, NOT the font-bold used by the other eyebrows
              (RelatedPages.tsx:43, Footer.tsx:60/88): Inter 700 ships but is
              deliberately not preloaded (see index.html), and this line is above
              the fold. `||` not `??` so an emptied CMS field falls back to the
              catalog string instead of rendering an empty kicker under an orphan
              rule (same semantics as image_alt below). */}
          <div className={`${SECTION_HEADER_MARGIN} animate-fade-in-up`}>
            <p className="text-xs md:text-sm font-medium uppercase tracking-wider text-muted-foreground">
              {block?.badge || <Trans>15+ years leading engineering teams</Trans>}
            </p>
            <div className="mt-3 flex items-end" aria-hidden="true">
              <span className="h-0.5 w-16 bg-accent" />
              <span className="h-px flex-1 bg-border" />
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-start">
            {/* Content */}
            <div className="space-y-8 animate-fade-in-up">
              <h1 className="text-fluid-4xl font-bold leading-tight">
                <Trans>
                  Lead an Engineering Org That{" "}
                  <span className="text-gradient-accent">Ships, Scales,</span>{" "}
                  {/* The underline is a squiggle BACKGROUND on this wrapper (not a
                      child SVG of the gradient text — background-clip:text would
                      clip it away in Chrome) with box-decoration-break:clone, so
                      it underlines every wrapped line. That is what lets a long
                      translated clause wrap without overflowing the column AND
                      still be underlined correctly in every language (the old
                      absolute SVG only underlined the last line once it wrapped).
                      The inner span keeps the gradient text. See .underline-squiggle. */}
                  <span className="underline-squiggle">
                    <span className="text-gradient-accent">and Lasts</span>
                  </span>
                </Trans>
              </h1>

              <p className="text-fluid-lg text-muted-foreground leading-relaxed">
                {block?.subheading ?? (
                  <Trans>One-on-one coaching for senior engineering leaders, from first-time managers to CTOs. We work on what you're measured by: delivery, retention, and an org that runs without heroics.</Trans>
                )}
              </p>

              {/* Booking lives in the nav bar (desktop CTA / mobile sticky CTA),
                  so the hero keeps a single outline action pointing at Services.
                  A real (locale-aware) link, not a JS button: crawlable href,
                  cmd/middle-click work — it's the hero's only action. */}
              <div className="pt-4">
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-2 hover:bg-secondary"
                >
                  <LocaleLink to="/services">
                    {block?.cta_text ?? <Trans>How Coaching Works</Trans>}
                  </LocaleLink>
                </Button>
              </div>

              <div className="pt-8 border-t border-border">
                <p className="text-sm text-muted-foreground mb-3">
                  {block?.industries_label || <Trans>Industries where I've led teams:</Trans>}
                </p>
                <div className="flex flex-wrap gap-4 text-sm font-medium text-muted-foreground">
                  {industries.map((industry, index) => (
                    <Fragment key={index}>
                      {index > 0 && <span aria-hidden="true">•</span>}
                      <span>{industry}</span>
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>

            {/* Profile Image. Both columns start under the masthead rule, so
                items-start aligns the H1's first line with the top of the photo.
                The deleted 70px lg-only top offset was the badge pill's 38px
                plus the 32px space-y-8 gap, and went with the pill. */}
            <div className="relative animate-fade-in delay-200">
              <div className="relative aspect-square max-w-lg mx-auto">
                {/* Glow effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-accent/20 to-accent/5 rounded-3xl blur-2xl" />

                {/* Image container */}
                <div className="relative rounded-3xl overflow-hidden shadow-2xl hover-lift">
                  <img
                    src={profileImage}
                    alt={block?.image_alt || t`Agustin Gonzalez Nicolini - Engineering Leadership Coach`}
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
    </section>
  );
};

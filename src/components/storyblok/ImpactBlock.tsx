import { storyblokEditable, StoryblokComponent } from "@storyblok/react";
import { ImpactBlockStoryblok } from "@/lib/types/storyblok";

interface ImpactBlockProps {
  blok: ImpactBlockStoryblok;
}

export const ImpactBlock = ({ blok }: ImpactBlockProps) => {
  if (!blok.show_section) {
    return null;
  }

  return (
    <section
      {...storyblokEditable(blok)}
      id="impact"
      className="py-24 md:py-32 bg-gradient-to-b from-background to-secondary/30"
    >
      <div className="container px-6">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <div className="text-center max-w-3xl mx-auto mb-16 animate-fade-in-up">
            {blok.heading && (
              <h2 className="text-fluid-3xl font-bold mb-6">{blok.heading}</h2>
            )}
            {blok.subheading && (
              <p className="text-fluid-lg text-muted-foreground whitespace-pre-wrap">
                {blok.subheading}
              </p>
            )}
          </div>

          {/* Metrics grid */}
          {blok.metrics && blok.metrics.length > 0 && (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {blok.metrics.map((metric, index) => (
                <div
                  key={metric._uid}
                  className={`animate-fade-in-up delay-${index * 100}`}
                >
                  <StoryblokComponent blok={metric} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

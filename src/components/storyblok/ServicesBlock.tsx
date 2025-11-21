import { storyblokEditable, StoryblokComponent } from "@storyblok/react";
import { ServicesBlockStoryblok } from "@/lib/types/storyblok";

interface ServicesBlockProps {
  blok: ServicesBlockStoryblok;
}

export const ServicesBlock = ({ blok }: ServicesBlockProps) => {
  if (!blok.show_section) {
    return null;
  }

  return (
    <section
      {...storyblokEditable(blok)}
      id="services"
      className="py-24 md:py-32 bg-background"
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

          {/* Services grid */}
          {blok.services && blok.services.length > 0 && (
            <div className="grid lg:grid-cols-3 gap-8">
              {blok.services.map((service, index) => (
                <div
                  key={service._uid}
                  className={`animate-fade-in-up delay-${index * 100}`}
                >
                  <StoryblokComponent blok={service} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

import { storyblokEditable, StoryblokComponent } from "@storyblok/react";
import { ServicesBlockStoryblok } from "@/lib/types/storyblok";
import { SECTION_HEADER_MARGIN, SECTION_PADDING } from "@/lib/layout";

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
      className={`${SECTION_PADDING} bg-background`}
    >
      <div className="container px-6">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <div className={`text-center max-w-3xl mx-auto ${SECTION_HEADER_MARGIN} animate-fade-in-up`}>
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

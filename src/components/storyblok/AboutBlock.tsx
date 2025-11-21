import { storyblokEditable, StoryblokComponent } from "@storyblok/react";
import { AboutBlockStoryblok } from "@/lib/types/storyblok";

interface AboutBlockProps {
  blok: AboutBlockStoryblok;
}

export const AboutBlock = ({ blok }: AboutBlockProps) => {
  if (!blok.show_section) {
    return null;
  }

  return (
    <section
      {...storyblokEditable(blok)}
      id="about"
      className="py-24 md:py-32 bg-background"
    >
      <div className="container px-6">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <div className="max-w-3xl mb-16 animate-fade-in-up">
            {blok.heading && (
              <h2 className="text-fluid-3xl font-bold mb-6">{blok.heading}</h2>
            )}
            {blok.subheading && (
              <p className="text-fluid-base text-muted-foreground mb-4">{blok.subheading}</p>
            )}
            {blok.content && (
              <div
                className="text-fluid-lg text-muted-foreground leading-relaxed prose prose-slate max-w-none"
                dangerouslySetInnerHTML={{ __html: blok.content }}
              />
            )}
          </div>

          {/* Image */}
          {blok.image && (
            <div className="mb-12 animate-fade-in-up delay-100">
              <img
                src={blok.image.filename}
                alt={blok.image.alt || blok.heading || "About"}
                className="w-full max-w-2xl mx-auto rounded-2xl shadow-xl"
              />
            </div>
          )}

          {/* Stats */}
          {blok.stats && blok.stats.length > 0 && (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {blok.stats.map((stat) => (
                <StoryblokComponent blok={stat} key={stat._uid} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

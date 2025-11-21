import { storyblokEditable, StoryblokComponent } from "@storyblok/react";
import { PhilosophyBlockStoryblok } from "@/lib/types/storyblok";

interface PhilosophyBlockProps {
  blok: PhilosophyBlockStoryblok;
}

export const PhilosophyBlock = ({ blok }: PhilosophyBlockProps) => {
  if (!blok.show_section) {
    return null;
  }

  return (
    <section
      {...storyblokEditable(blok)}
      id="philosophy"
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
            {blok.content && (
              <div
                className="mt-6 text-fluid-base text-muted-foreground leading-relaxed prose prose-slate max-w-none"
                dangerouslySetInnerHTML={{ __html: blok.content }}
              />
            )}
          </div>

          {/* Principles */}
          {blok.principles && blok.principles.length > 0 && (
            <div className="space-y-8">
              {blok.principles.map((principle, index) => (
                <div
                  key={principle._uid}
                  className={`group animate-fade-in-up delay-${index * 100}`}
                >
                  <div className="relative">
                    {/* Connecting line (except for last item) */}
                    {index < blok.principles!.length - 1 && (
                      <div className="absolute left-8 top-24 w-0.5 h-16 bg-gradient-to-b from-border to-transparent hidden md:block" />
                    )}
                    <StoryblokComponent blok={principle} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

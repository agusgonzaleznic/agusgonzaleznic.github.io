import { storyblokEditable, StoryblokComponent } from "@storyblok/react";
import { TestimonialsBlockStoryblok } from "@/lib/types/storyblok";

interface TestimonialsBlockProps {
  blok: TestimonialsBlockStoryblok;
}

export const TestimonialsBlock = ({ blok }: TestimonialsBlockProps) => {
  if (!blok.show_section) {
    return null;
  }

  return (
    <section
      {...storyblokEditable(blok)}
      id="testimonials"
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

          {/* Testimonials grid */}
          {blok.testimonials && blok.testimonials.length > 0 && (
            <div className="grid md:grid-cols-3 gap-8">
              {blok.testimonials.map((testimonial, index) => (
                <div
                  key={testimonial._uid}
                  className={`animate-fade-in-up delay-${index * 100}`}
                >
                  <StoryblokComponent blok={testimonial} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

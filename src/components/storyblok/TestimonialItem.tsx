import { storyblokEditable } from "@storyblok/react";
import { TestimonialItemStoryblok } from "@/lib/types/storyblok";
import { Card } from "@/components/ui/card";
import { Quote, Star } from "lucide-react";

interface TestimonialItemProps {
  blok: TestimonialItemStoryblok;
}

export const TestimonialItem = ({ blok }: TestimonialItemProps) => {
  return (
    <Card
      {...storyblokEditable(blok)}
      className="p-8 hover-lift border-2 hover:border-accent/30 transition-all duration-300 relative"
    >
      {/* Quote icon */}
      <div className="absolute -top-4 left-8 w-12 h-12 rounded-full bg-accent flex items-center justify-center shadow-md">
        <Quote className="w-6 h-6 text-accent-foreground" fill="currentColor" />
      </div>

      <div className="pt-6">
        {/* Rating */}
        {blok.rating && (
          <div className="flex gap-1 mb-4">
            {Array.from({ length: blok.rating }).map((_, i) => (
              <Star
                key={i}
                className="w-4 h-4 text-accent fill-accent"
              />
            ))}
          </div>
        )}

        {/* Quote */}
        <p className="text-foreground leading-relaxed mb-8 italic">
          "{blok.quote}"
        </p>

        {/* Author info */}
        <div className="flex items-center gap-4">
          {blok.author_image ? (
            <img
              src={blok.author_image.filename}
              alt={blok.author_image.alt || blok.author_name}
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center text-accent-foreground font-bold">
              {blok.author_name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)}
            </div>
          )}
          <div>
            <p className="font-semibold text-foreground">{blok.author_name}</p>
            <p className="text-sm text-muted-foreground">
              {blok.author_role}
              {blok.author_company && ` • ${blok.author_company}`}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
};

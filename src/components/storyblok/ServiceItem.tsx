import { storyblokEditable } from "@storyblok/react";
import { ServiceItemStoryblok } from "@/lib/types/storyblok";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, ArrowRight } from "lucide-react";
import * as LucideIcons from "lucide-react";

interface ServiceItemProps {
  blok: ServiceItemStoryblok;
}

export const ServiceItem = ({ blok }: ServiceItemProps) => {
  const IconComponent = blok.icon
    ? (LucideIcons[blok.icon as keyof typeof LucideIcons] as React.ElementType)
    : null;

  // Parse features from textarea (one per line)
  const features = blok.features ? blok.features.split("\n").filter(f => f.trim()) : [];

  const handleCTA = () => {
    // Default booking link - can be made configurable via Storyblok if needed
    window.open("https://calendar.app.google/kFaanhSae5WefLnD7", "_blank");
  };

  return (
    <Card
      {...storyblokEditable(blok)}
      className={`p-8 hover-lift transition-all duration-300 ${
        blok.is_highlighted
          ? "border-2 border-accent shadow-accent relative"
          : "border-2 hover:border-accent/30"
      }`}
    >
      {blok.is_highlighted && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground px-4 py-1 rounded-full text-sm font-medium">
          Most Popular
        </div>
      )}

      {IconComponent && (
        <div className="w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center mb-6">
          <IconComponent className="w-7 h-7 text-accent" />
        </div>
      )}

      <h3 className="text-2xl font-bold mb-3">{blok.title}</h3>

      <p className="text-muted-foreground mb-6 leading-relaxed">
        {blok.description}
      </p>

      {features.length > 0 && (
        <ul className="space-y-3 mb-8">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start gap-3">
              <Check className="w-5 h-5 text-accent shrink-0 mt-0.5" />
              <span className="text-sm text-muted-foreground">{feature}</span>
            </li>
          ))}
        </ul>
      )}

      <Button
        onClick={handleCTA}
        variant={blok.is_highlighted ? "default" : "outline"}
        className={`w-full group ${
          blok.is_highlighted
            ? "bg-accent hover:bg-accent-hover text-accent-foreground"
            : ""
        }`}
      >
        {blok.cta_text || "Learn More"}
        <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
      </Button>
    </Card>
  );
};

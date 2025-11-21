import { storyblokEditable } from "@storyblok/react";
import { StatItemStoryblok } from "@/lib/types/storyblok";
import { Card } from "@/components/ui/card";
import * as LucideIcons from "lucide-react";

interface StatItemProps {
  blok: StatItemStoryblok;
}

export const StatItem = ({ blok }: StatItemProps) => {
  // Get the icon component from lucide-react
  const IconComponent = blok.icon
    ? (LucideIcons[blok.icon as keyof typeof LucideIcons] as React.ElementType)
    : null;

  return (
    <Card
      {...storyblokEditable(blok)}
      className="p-6 hover-lift border-2 hover:border-accent/50 transition-all duration-300"
    >
      {IconComponent && (
        <div className="mb-4">
          <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
            <IconComponent className="w-6 h-6 text-accent" />
          </div>
        </div>
      )}
      <div className="text-3xl font-bold text-accent mb-2">{blok.value}</div>
      <h4 className="text-lg font-semibold mb-2">{blok.label}</h4>
      {blok.description && (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {blok.description}
        </p>
      )}
    </Card>
  );
};

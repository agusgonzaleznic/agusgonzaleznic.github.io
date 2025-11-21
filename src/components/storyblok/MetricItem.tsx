import { storyblokEditable } from "@storyblok/react";
import { MetricItemStoryblok } from "@/lib/types/storyblok";
import { Card } from "@/components/ui/card";
import * as LucideIcons from "lucide-react";

interface MetricItemProps {
  blok: MetricItemStoryblok;
}

export const MetricItem = ({ blok }: MetricItemProps) => {
  const IconComponent = blok.icon
    ? (LucideIcons[blok.icon as keyof typeof LucideIcons] as React.ElementType)
    : null;

  return (
    <Card
      {...storyblokEditable(blok)}
      className="p-6 hover-lift border-2 hover:border-accent/30 transition-all duration-300"
    >
      <div className="flex items-start gap-4">
        {IconComponent && (
          <div className="shrink-0 w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
            <IconComponent className="w-6 h-6 text-accent" strokeWidth={2} />
          </div>
        )}
        <div className="flex-1">
          <div className="text-3xl font-bold text-accent mb-1">{blok.value}</div>
          <div className="text-sm font-semibold text-foreground mb-2">{blok.label}</div>
          {blok.description && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {blok.description}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
};

import { storyblokEditable } from "@storyblok/react";
import { PrincipleItemStoryblok } from "@/lib/types/storyblok";
import * as LucideIcons from "lucide-react";

interface PrincipleItemProps {
  blok: PrincipleItemStoryblok;
}

export const PrincipleItem = ({ blok }: PrincipleItemProps) => {
  const IconComponent = blok.icon
    ? (LucideIcons[blok.icon as keyof typeof LucideIcons] as React.ElementType)
    : null;

  return (
    <div
      {...storyblokEditable(blok)}
      className="flex flex-col md:flex-row gap-6 md:gap-8 p-8 rounded-2xl bg-card border-2 border-border hover:border-accent/30 hover:shadow-lg transition-all duration-300"
    >
      {/* Icon */}
      {IconComponent && (
        <div className="shrink-0">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <IconComponent className="w-8 h-8 text-accent" strokeWidth={1.5} />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1">
        <h3 className="text-fluid-xl font-semibold mb-3 group-hover:text-accent transition-colors">
          {blok.title}
        </h3>
        <p className="text-fluid-base text-muted-foreground leading-relaxed">
          {blok.description}
        </p>
      </div>
    </div>
  );
};

// Bounded maps that keep CMS-chosen icons/colors pixel-identical to the design.
//
// Storyblok stores an icon as a NAME (an option field limited to these keys) and
// a color as a THEME key; the components resolve them here to the exact lucide
// component and Tailwind class the hardcoded design used. New CMS content can
// only pick from this set, so the design system stays closed — adding an option
// is a deliberate code change here + in the Storyblok schema (terraform).
import {
  Lightbulb,
  Cog,
  Heart,
  Target,
  ShieldCheck,
  MessagesSquare,
  Wrench,
  TrendingDown,
  Shield,
  Rocket,
  Zap,
  Users,
  type LucideIcon,
} from "lucide-react";

export const ICON_MAP: Record<string, LucideIcon> = {
  // Philosophy pillars
  Lightbulb,
  Cog,
  Heart,
  // How I Work values
  Target,
  ShieldCheck,
  MessagesSquare,
  Wrench,
  // Impact stats (used when that page is migrated)
  TrendingDown,
  Shield,
  Rocket,
  Zap,
  Users,
};

// Gradient themes used by the Philosophy pillar icon tiles.
export const THEME_MAP: Record<string, string> = {
  accent: "from-accent/20 to-accent/5",
  primary: "from-primary/20 to-primary/5",
};

/** Resolve an icon name to its lucide component, falling back to `fallback`. */
export function resolveIcon(name: string | undefined, fallback: LucideIcon): LucideIcon {
  return (name && ICON_MAP[name]) || fallback;
}

/** Resolve a theme key to its gradient class, defaulting to the accent theme. */
export function resolveTheme(theme: string | undefined): string {
  return (theme && THEME_MAP[theme]) || THEME_MAP.accent;
}

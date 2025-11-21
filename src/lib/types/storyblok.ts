// ==========================================
// Base Storyblok Types
// ==========================================

/**
 * Base interface for all Storyblok components
 */
export interface StoryblokComponent {
  _uid: string;
  component: string;
  _editable?: string;
}

/**
 * Storyblok Story - Represents a content entry in Storyblok
 */
export interface StoryblokStory<T = StoryblokComponent> {
  id: number;
  uuid: string;
  name: string;
  slug: string;
  full_slug: string;
  created_at: string;
  published_at: string | null;
  content: T;
  is_startpage: boolean;
  parent_id: number | null;
  position: number;
  tag_list: string[];
}

/**
 * Storyblok Asset/Image type
 */
export interface StoryblokAsset {
  id: number;
  alt: string;
  name: string;
  focus: string;
  title: string;
  filename: string;
  copyright: string;
  fieldtype: string;
}

/**
 * Storyblok Rich Text type
 */
export interface StoryblokRichText {
  type: string;
  content?: StoryblokRichText[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
  attrs?: Record<string, unknown>;
}

// ==========================================
// Content Types
// ==========================================

/**
 * Page Content Type
 * Main content type for website pages
 */
export interface PageStoryblok extends StoryblokComponent {
  component: "page";
  body?: StoryblokComponent[];
  seo_title?: string;
  seo_description?: string;
  og_image?: StoryblokAsset;
}

// ==========================================
// Block Types - Hero Section
// ==========================================

/**
 * Hero Block
 * Main hero section at the top of the page
 */
export interface HeroBlockStoryblok extends StoryblokComponent {
  component: "hero_block";
  name: string;
  title: string;
  tagline: string;
  description: string;
  cta_text?: string;
  cta_url?: string;
  secondary_cta_text?: string;
  secondary_cta_url?: string;
  profile_image: StoryblokAsset;
  background_style?: "gradient" | "solid" | "image";
}

// ==========================================
// Block Types - About Section
// ==========================================

/**
 * About Block
 * About section with content and optional stats
 */
export interface AboutBlockStoryblok extends StoryblokComponent {
  component: "about_block";
  heading: string;
  subheading?: string;
  content: string;
  image?: StoryblokAsset;
  stats?: StatItemStoryblok[];
  show_section?: boolean;
}

/**
 * Stat Item (nested in About Block)
 * Individual statistic display
 */
export interface StatItemStoryblok extends StoryblokComponent {
  component: "stat_item";
  value: string;
  label: string;
  description?: string;
  icon?: string;
}

// ==========================================
// Block Types - Services Section
// ==========================================

/**
 * Services Block (container)
 * Container for service offerings
 */
export interface ServicesBlockStoryblok extends StoryblokComponent {
  component: "services_block";
  heading: string;
  subheading?: string;
  services: ServiceItemStoryblok[];
  show_section?: boolean;
}

/**
 * Service Item (nested block)
 * Individual service offering
 */
export interface ServiceItemStoryblok extends StoryblokComponent {
  component: "service_item";
  icon: string;
  title: string;
  description: string;
  features: string;
  cta_text?: string;
  is_highlighted?: boolean;
}

// ==========================================
// Block Types - Testimonials Section
// ==========================================

/**
 * Testimonials Block (container)
 * Container for client testimonials
 */
export interface TestimonialsBlockStoryblok extends StoryblokComponent {
  component: "testimonials_block";
  heading: string;
  subheading?: string;
  testimonials: TestimonialItemStoryblok[];
  show_section?: boolean;
}

/**
 * Testimonial Item
 * Individual client testimonial
 */
export interface TestimonialItemStoryblok extends StoryblokComponent {
  component: "testimonial_item";
  quote: string;
  author_name: string;
  author_role: string;
  author_company?: string;
  author_image?: StoryblokAsset;
  rating?: number;
}

// ==========================================
// Block Types - Philosophy Section
// ==========================================

/**
 * Philosophy Block
 * Coaching philosophy section with principles
 */
export interface PhilosophyBlockStoryblok extends StoryblokComponent {
  component: "philosophy_block";
  heading: string;
  subheading?: string;
  content: string;
  principles?: PrincipleItemStoryblok[];
  show_section?: boolean;
}

/**
 * Principle Item (nested in Philosophy Block)
 * Individual coaching principle
 */
export interface PrincipleItemStoryblok extends StoryblokComponent {
  component: "principle_item";
  icon: string;
  title: string;
  description: string;
}

// ==========================================
// Block Types - Impact Section
// ==========================================

/**
 * Impact Block
 * Impact and results section with metrics
 */
export interface ImpactBlockStoryblok extends StoryblokComponent {
  component: "impact_block";
  heading: string;
  subheading?: string;
  metrics: MetricItemStoryblok[];
  show_section?: boolean;
}

/**
 * Metric Item (nested in Impact Block)
 * Individual metric/statistic
 */
export interface MetricItemStoryblok extends StoryblokComponent {
  component: "metric_item";
  value: string;
  label: string;
  description?: string;
  icon?: string;
}

// ==========================================
// Union Types
// ==========================================

/**
 * Union type of all block types for type safety
 * Use this when you need to accept any Storyblok block
 */
export type AllStoryblokBlocks =
  | HeroBlockStoryblok
  | AboutBlockStoryblok
  | StatItemStoryblok
  | ServicesBlockStoryblok
  | ServiceItemStoryblok
  | TestimonialsBlockStoryblok
  | TestimonialItemStoryblok
  | PhilosophyBlockStoryblok
  | PrincipleItemStoryblok
  | ImpactBlockStoryblok
  | MetricItemStoryblok;

// ==========================================
// Helper Types
// ==========================================

/**
 * Generic props interface for Storyblok components
 */
export interface StoryblokComponentProps<T extends StoryblokComponent> {
  blok: T;
}

/**
 * Story response from Storyblok API
 */
export interface StoryblokResponse<T = StoryblokComponent> {
  story: StoryblokStory<T>;
  cv: number;
  rels: StoryblokStory[];
  links: StoryblokStory[];
}

/**
 * Stories response from Storyblok API (multiple stories)
 */
export interface StoryblokStoriesResponse<T = StoryblokComponent> {
  stories: StoryblokStory<T>[];
  cv: number;
  rels: StoryblokStory[];
  links: StoryblokStory[];
}

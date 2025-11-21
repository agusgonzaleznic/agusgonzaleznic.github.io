import { storyblokInit, apiPlugin } from "@storyblok/react";
import {
  Page,
  HeroBlock,
  AboutBlock,
  StatItem,
  ServicesBlock,
  ServiceItem,
  TestimonialsBlock,
  TestimonialItem,
  PhilosophyBlock,
  PrincipleItem,
  ImpactBlock,
  MetricItem,
} from "@/components/storyblok";

/**
 * Initialize Storyblok SDK
 *
 * This function initializes the Storyblok SDK with the access token from environment variables.
 * It configures the API plugin for fetching content and sets up caching.
 *
 * @returns Storyblok instance or null if token is not configured
 */
const initStoryblok = () => {
  const accessToken = import.meta.env.VITE_STORYBLOK_ACCESS_TOKEN;

  // Check if access token is configured
  if (!accessToken) {
    console.warn(
      "⚠️ Storyblok access token not found. CMS features will be disabled.\n" +
      "To enable Storyblok:\n" +
      "1. Copy .env.example to .env\n" +
      "2. Add your Storyblok access token to VITE_STORYBLOK_ACCESS_TOKEN\n" +
      "3. Get your token from: Storyblok Dashboard > Settings > Access Tokens"
    );
    return null;
  }

  // Get API region from environment
  const region = getStoryblokRegion();

  // Initialize Storyblok with configuration
  return storyblokInit({
    accessToken,
    use: [apiPlugin], // Enable API plugin for content fetching
    apiOptions: {
      region, // Use region from environment or default to EU
      cache: {
        clear: "auto", // Automatically clear cache when content changes
        type: "memory", // Use in-memory cache for better performance
      },
    },
    // Register all Storyblok components
    components: {
      page: Page,
      hero_block: HeroBlock,
      about_block: AboutBlock,
      stat_item: StatItem,
      services_block: ServicesBlock,
      service_item: ServiceItem,
      testimonials_block: TestimonialsBlock,
      testimonial_item: TestimonialItem,
      philosophy_block: PhilosophyBlock,
      principle_item: PrincipleItem,
      impact_block: ImpactBlock,
      metric_item: MetricItem,
    },
  });
};

/**
 * Check if Storyblok is enabled
 * @returns true if Storyblok access token is configured
 */
export const isStoryblokEnabled = (): boolean => {
  return !!import.meta.env.VITE_STORYBLOK_ACCESS_TOKEN;
};

/**
 * Get Storyblok API region
 * Can be overridden via VITE_STORYBLOK_REGION environment variable
 * @returns "eu" or "us"
 */
export const getStoryblokRegion = (): "eu" | "us" => {
  const region = import.meta.env.VITE_STORYBLOK_REGION;
  return region === "us" ? "us" : "eu";
};

export { initStoryblok };

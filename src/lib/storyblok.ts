import { storyblokInit, apiPlugin } from "@storyblok/react";

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

  // Initialize Storyblok with configuration
  return storyblokInit({
    accessToken,
    use: [apiPlugin], // Enable API plugin for content fetching
    apiOptions: {
      region: "eu", // Change to "us" if your Storyblok space is in US region
      cache: {
        clear: "auto", // Automatically clear cache when content changes
        type: "memory", // Use in-memory cache for better performance
      },
    },
    // Components will be registered here later (Phase 4)
    // components: {},
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

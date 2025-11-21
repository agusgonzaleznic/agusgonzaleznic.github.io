import { useEffect, useState } from "react";
import { useStoryblokApi, StoryblokComponent, useStoryblokState } from "@storyblok/react";
import { StoryblokStory } from "@/lib/types/storyblok";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";

interface StoryblokPageProps {
  slug?: string;
}

export const StoryblokPage = ({ slug = "home" }: StoryblokPageProps) => {
  const [initialStory, setInitialStory] = useState<StoryblokStory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const storyblokApi = useStoryblokApi();

  // Fetch initial story
  useEffect(() => {
    const fetchStory = async () => {
      if (!storyblokApi) {
        setError("Storyblok API not initialized. Please configure VITE_STORYBLOK_ACCESS_TOKEN.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const { data } = await storyblokApi.get(`cdn/stories/${slug}`, {
          version: "draft", // Use "published" in production
          resolve_relations: [],
        });

        setInitialStory(data.story);
        setError(null);
      } catch (err) {
        console.error("Error fetching story:", err);
        setError("Failed to load content from Storyblok. Make sure the story exists and your access token is valid.");
      } finally {
        setLoading(false);
      }
    };

    fetchStory();
  }, [slug, storyblokApi]);

  // Use bridge for live updates in Visual Editor
  const story = useStoryblokState(initialStory);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4" />
          <p className="text-muted-foreground">Loading content from Storyblok...</p>
        </div>
      </div>
    );
  }

  if (error || !story) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-6">
          <h1 className="text-2xl font-bold mb-4">Content Not Available</h1>
          <p className="text-muted-foreground mb-6">
            {error || "The requested page could not be loaded."}
          </p>
          <a href="/" className="text-accent hover:underline font-medium">
            Return to homepage
          </a>
        </div>
      </div>
    );
  }

  return (
    <>
      <Navigation />
      <StoryblokComponent blok={story.content} />
      <Footer />
    </>
  );
};

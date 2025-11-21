import { StoryblokComponent, storyblokEditable } from "@storyblok/react";
import { Helmet } from "react-helmet";
import { PageStoryblok } from "@/lib/types/storyblok";

interface PageProps {
  blok: PageStoryblok;
}

export const Page = ({ blok }: PageProps) => {
  return (
    <div {...storyblokEditable(blok)}>
      {/* SEO metadata */}
      {blok.seo_title && (
        <Helmet>
          <title>{blok.seo_title}</title>
          {blok.seo_description && (
            <meta name="description" content={blok.seo_description} />
          )}
          {blok.og_image && (
            <>
              <meta property="og:image" content={blok.og_image.filename} />
              <meta name="twitter:image" content={blok.og_image.filename} />
            </>
          )}
        </Helmet>
      )}

      {/* Render nested blocks */}
      <div className="min-h-screen">
        {blok.body?.map((nestedBlok) => (
          <StoryblokComponent blok={nestedBlok} key={nestedBlok._uid} />
        ))}
      </div>
    </div>
  );
};

import { storyblokImage, storyblokImageSize, storyblokSrcSet, type BlogImage } from "@/lib/richtext";

// The article cover, shared by the real article page and the Visual Editor
// preview. Shared deliberately: StoryblokPage exists to render a draft through
// the SAME markup production uses, so two copies of this drift apart silently.
//
// What it fixes:
//   - one fixed 1536px render was served to every viewport, so a phone
//     downloaded a desktop-sized image
//   - no width/height, so the image had no aspect-ratio box and its arrival
//     shifted the article text down (CLS) on the LCP element itself

const COVER_WIDTHS = [640, 768, 1024, 1280, 1536];

// The column is min(100vw - 48px, 768px): .max-w-3xl is 48rem = 768px and the
// container adds px-6 (24px) each side, so the two cross at 816px. Verified
// against the built CSS rather than inferred from the class names — px-6 wins
// over .container's own 2rem padding there, and the container has no md/lg
// max-width step.
const COVER_SIZES = "(min-width: 816px) 768px, calc(100vw - 48px)";

type Props = {
  image: BlogImage;
  /** Used when the asset carries no alt of its own. */
  fallbackAlt: string;
  /** True on the article page: this is the LCP candidate. */
  priority?: boolean;
};

export const CoverImage = ({ image, fallbackAlt, priority = false }: Props) => {
  const srcSet = storyblokSrcSet(image.filename, COVER_WIDTHS);
  const size = storyblokImageSize(image.filename);
  // Omitted entirely when the URL carries no WxH segment (SVGs do not). A guessed
  // aspect ratio would distort the image; Tailwind's preflight ships
  // img{max-width:100%;height:auto}, so real attributes only supply the box.
  const box = size
    ? { width: 1536, height: Math.round((1536 * size.height) / size.width) }
    : {};

  return (
    <img
      src={storyblokImage(image.filename, 1536)}
      {...(srcSet ? { srcSet, sizes: COVER_SIZES } : {})}
      {...box}
      alt={image.alt || fallbackAlt}
      // React 18 forwards only the all-lowercase spelling of fetchpriority, so
      // the camelCase prop would be dropped silently.
      {...(priority
        ? ({ loading: "eager", fetchpriority: "high" } as Record<string, string>)
        : ({ loading: "lazy", decoding: "async" } as Record<string, string>))}
      className="w-full max-w-full rounded-lg"
    />
  );
};

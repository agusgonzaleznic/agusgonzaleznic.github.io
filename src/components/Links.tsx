import { ArrowRight, ArrowUpRight } from "lucide-react";
import { LocaleLink } from "@/components/LocaleLink";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { resolveLinkIcon } from "@/lib/storyblok-icons";
import type { PageBlock } from "@/lib/pages";
import profileImage from "@/assets/profile.jpg";

// One link on the /links page. All fields come from Storyblok (link_item blok).
export interface LinkField {
  label?: string;
  url?: string;
  description?: string;
  icon?: string;
  /** Identity link ("me elsewhere") → gets rel="me" + feeds Person.sameAs. */
  is_profile?: boolean;
  /** Optional uploaded logo (Storyblok asset). Overrides `icon`; rendered monochrome. */
  image?: { filename?: string | null; alt?: string | null } | null;
  /** Renders this link as a filled accent button — for the single primary CTA. */
  featured?: boolean;
}

// The /links page content (links_block blok on a `page` story).
export interface LinksBlock extends PageBlock {
  heading?: string;
  subheading?: string;
  links?: LinkField[];
  show_section?: boolean;
}

const isInternal = (url: string) => url.startsWith("/");
const isMailOrTel = (url: string) => /^(mailto|tel):/i.test(url);
// CMS input is untrusted: refuse script-ish URL schemes (mirrors RichText.tsx).
const isSafeUrl = (url: string) => !/^\s*(javascript|data|vbscript):/i.test(url);

// Shared row layout; the variant classes below layer on top for the two looks.
const CARD_BASE =
  "group flex items-center gap-4 rounded-xl px-5 py-4 transition-colors";

// Neutral card (default) vs. featured accent button (the single primary CTA).
const NEUTRAL = {
  card: "border border-border bg-card/40 hover:border-accent/60 hover:bg-card",
  iconWrap: "bg-secondary text-foreground",
  label: "font-medium text-foreground",
  desc: "text-muted-foreground",
  arrow: "text-muted-foreground transition-colors group-hover:text-accent",
};
const FEATURED = {
  card: "border border-transparent bg-accent text-accent-foreground shadow-accent hover:bg-accent-hover",
  // White square + accent-coloured glyph inverts the neutral look → high contrast on the button.
  iconWrap: "bg-accent-foreground text-accent",
  label: "font-semibold text-accent-foreground",
  desc: "text-accent-foreground/80",
  arrow: "text-accent-foreground",
};

const LinkRow = ({ link }: { link: LinkField }) => {
  const url = (link.url ?? "").trim();
  if (!link.label || !url || !isSafeUrl(url)) return null;
  const internal = isInternal(url);
  const v = link.featured ? FEATURED : NEUTRAL;
  const Icon = resolveLinkIcon(link.icon);
  // A custom uploaded logo overrides the icon. It's painted as a single-colour
  // CSS mask (bg-current), so it inherits the icon-wrap text colour and comes out
  // monochrome/on-theme regardless of the asset's own colours.
  const rawLogo = link.image?.filename ?? "";
  const logo = /^(https?:)?\/\//.test(rawLogo) ? rawLogo : "";
  const glyph = logo ? (
    <span
      className="h-5 w-5 bg-current"
      role="img"
      aria-label={link.image?.alt || link.label}
      style={{
        maskImage: `url("${logo}")`,
        WebkitMaskImage: `url("${logo}")`,
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
        maskSize: "contain",
        WebkitMaskSize: "contain",
      }}
    />
  ) : (
    <Icon className="h-5 w-5" aria-hidden="true" />
  );
  // ↗ signals "opens elsewhere" (external / new tab); → for an in-app route.
  const Arrow = internal ? ArrowRight : ArrowUpRight;
  const inner = (
    <>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${v.iconWrap}`}>
        {glyph}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block ${v.label}`}>{link.label}</span>
        {link.description && (
          <span className={`block line-clamp-2 text-sm ${v.desc}`}>{link.description}</span>
        )}
      </span>
      <Arrow className={`h-4 w-4 shrink-0 ${v.arrow}`} aria-hidden="true" />
    </>
  );

  const className = `${CARD_BASE} ${v.card}`;

  // Internal path → locale-aware client route; mailto/tel → same tab; else new tab.
  if (internal) {
    return (
      <LocaleLink to={url} className={className}>
        {inner}
      </LocaleLink>
    );
  }
  const newTab = !isMailOrTel(url);
  const rel = link.is_profile ? "me noopener noreferrer" : "noopener noreferrer";
  return (
    <a href={url} {...(newTab ? { target: "_blank", rel } : {})} className={className}>
      {inner}
    </a>
  );
};

/**
 * The /links "linktree" body: profile header + a stacked list of Storyblok-managed
 * links. Standalone/minimal (no site nav or footer — the page wrapper passes
 * chrome={false} to SeoPage) but uses the site's exact tokens and type scale.
 */
export const Links = ({ block }: { block?: LinksBlock }) => {
  if (block?.show_section === false) return null;
  const links = (block?.links ?? []).filter((l) => l?.label && l?.url);
  return (
    <div className="flex min-h-screen flex-col items-center px-6 py-16 md:py-24">
      <div className="w-full max-w-md animate-fade-in-up">
        <header className="flex flex-col items-center text-center">
          {/* Photo + name link home — the universal "brand → home" affordance.
              alt="" because the adjacent <h1> already names the person (WCAG H2:
              combined image+text link), so the link's accessible name is the name. */}
          <LocaleLink
            to="/"
            className="group flex flex-col items-center rounded-2xl outline-none transition focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background"
          >
            <img
              src={profileImage}
              alt=""
              width="96"
              height="96"
              loading="eager"
              {...({ fetchpriority: "high" } as Record<string, string>)}
              className="h-24 w-24 rounded-full object-cover ring-1 ring-border transition group-hover:ring-accent/60"
            />
            <h1 className="mt-6 text-fluid-2xl font-bold leading-tight transition-colors group-hover:text-accent">
              {block?.heading ?? "Agustin Gonzalez Nicolini"}
            </h1>
          </LocaleLink>
          {block?.subheading && (
            <p className="mt-2 text-fluid-base text-muted-foreground">{block.subheading}</p>
          )}
        </header>

        <nav className="mt-10 flex flex-col gap-3" aria-label="Links">
          {links.map((link, i) => (
            <LinkRow key={i} link={link} />
          ))}
        </nav>

        <div className="mt-12 flex flex-col items-center gap-4">
          <LocaleLink
            to="/"
            className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-accent hover:underline"
          >
            agusgonzaleznic.com
          </LocaleLink>
          {/* Minimal on-page language switch — the page has no nav, so this is
              the only affordance to change language. Crawlable + instant. */}
          <LanguageSwitcher variant="inline" />
        </div>
      </div>
    </div>
  );
};

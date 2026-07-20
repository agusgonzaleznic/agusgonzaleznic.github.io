import { ArrowUpRight } from "lucide-react";
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

const CARD =
  "group flex items-center gap-4 rounded-xl border border-border bg-card/40 px-5 py-4 " +
  "transition-colors hover:border-accent/60 hover:bg-card";

const LinkRow = ({ link }: { link: LinkField }) => {
  const url = (link.url ?? "").trim();
  if (!link.label || !url || !isSafeUrl(url)) return null;
  const Icon = resolveLinkIcon(link.icon);
  // A custom uploaded logo overrides the icon. It's painted as a single-colour
  // CSS mask (bg-current), so any SVG / transparent-PNG comes out monochrome and
  // matches the built-in lucide icons regardless of the asset's own colours.
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
  const inner = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
        {glyph}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-foreground">{link.label}</span>
        {link.description && (
          <span className="block truncate text-sm text-muted-foreground">{link.description}</span>
        )}
      </span>
      <ArrowUpRight
        className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent"
        aria-hidden="true"
      />
    </>
  );

  // Internal path → locale-aware client route; mailto/tel → same tab; else new tab.
  if (isInternal(url)) {
    return (
      <LocaleLink to={url} className={CARD}>
        {inner}
      </LocaleLink>
    );
  }
  const newTab = !isMailOrTel(url);
  const rel = link.is_profile ? "me noopener noreferrer" : "noopener noreferrer";
  return (
    <a href={url} {...(newTab ? { target: "_blank", rel } : {})} className={CARD}>
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
          <img
            src={profileImage}
            alt="Agustin Gonzalez Nicolini"
            width="96"
            height="96"
            loading="eager"
            {...({ fetchpriority: "high" } as Record<string, string>)}
            className="h-24 w-24 rounded-full object-cover ring-1 ring-border"
          />
          <h1 className="mt-6 text-fluid-2xl font-bold leading-tight">
            {block?.heading ?? "Agustin Gonzalez Nicolini"}
          </h1>
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

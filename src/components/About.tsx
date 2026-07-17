import { Trans, useLingui } from "@lingui/react/macro";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import profileImage from "@/assets/profile.jpg";
import type { PageBlock } from "@/lib/pages";
import { SECTION_PADDING } from "@/lib/layout";

// Hardcoded fallback — also the seed source for Storyblok. The profile photo is a
// design asset (kept in code, same hashed URL as the hero); only its ALT is CMS
// content. Heading/footnote fall back to their inline <Trans>; the paragraphs are
// a list, so they fall back through these descriptors.
const DEFAULT_PARAGRAPHS: MessageDescriptor[] = [
  msg`I'm Agustin Gonzalez Nicolini. For 15+ years I've built and led multi-disciplinary teams across fintech, gaming, e-mobility, healthtech, and web3 — shipping REST and GraphQL architectures on serverless and containerized cloud-native systems, including a core banking platform.`,
  msg`I advise C-suite and senior engineering leaders on cloud-native systems, DevOps transformation, and security — and I've likely sat through a version of whatever you're facing: the reorg, the audit, the outage review, the budget fight. Whether you're taking a startup through scale-up or restoring delivery discipline in an enterprise org, we build the systems and habits that let your team deliver without you as the bottleneck.`,
];

export interface ParagraphField {
  text?: string;
}
export interface AboutBlock extends PageBlock {
  heading?: string;
  image_alt?: string;
  paragraphs?: ParagraphField[];
  footnote?: string;
}

export const About = ({ block }: { block?: AboutBlock }) => {
  const { t, i18n } = useLingui();
  if (block?.show_section === false) return null;
  const alt = block?.image_alt || t`Agustin Gonzalez Nicolini — engineering leadership coach in Berlin`;
  const paragraphs = block?.paragraphs?.length
    ? block.paragraphs.map((p) => p.text ?? "")
    : DEFAULT_PARAGRAPHS.map((p) => i18n._(p));

  return (
    <section id="about" className={`${SECTION_PADDING} bg-background`}>
      <div className="container px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-3xl mx-auto animate-fade-in-up">
            {/* Same hashed asset as the hero, so it's already cached. Fixed
                dimensions to avoid CLS. */}
            <img
              src={profileImage}
              alt={alt}
              className="w-36 h-36 rounded-full object-cover mx-auto mb-8 shadow-lg"
              loading="eager"
              width="144"
              height="144"
            />
            <h1 className="text-fluid-3xl font-bold mb-6">
              {block?.heading ?? <Trans>From Haedo to Berlin, One Engineering Team at a Time</Trans>}
            </h1>
            {paragraphs.map((text, index) => (
              <p
                key={index}
                className={`text-fluid-lg text-muted-foreground leading-relaxed${index < paragraphs.length - 1 ? " mb-6" : ""}`}
              >
                {text}
              </p>
            ))}
            {/* Facts already published on /faq and /contact, surfaced here so
                the About page itself answers where/how/in which languages. */}
            <p className="mt-6 text-sm font-medium text-muted-foreground">
              {block?.footnote ?? (
                <Trans>Based in Berlin — coaching engineering leaders remotely worldwide, in English, Spanish, or German.</Trans>
              )}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

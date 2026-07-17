import { msg } from "@lingui/core/macro";
import type { I18n } from "@lingui/core";
import type { PageBlock } from "@/lib/pages";

// Hardcoded FALLBACK Q&A + seed source. Used when no CMS faq_block is present.
export const faqs = [
  {
    question: msg`Who is Agustin Gonzalez Nicolini?`,
    answer: msg`I'm an engineering leader and leadership coach based in Berlin, Germany. I've led engineering teams at companies including Ualá, Wildlife Studios, JUCR, and Bdev; today I head infrastructure and security at a Web3 company and coach senior technology leaders one-on-one.`,
  },
  {
    question: msg`Who does Agustin coach?`,
    answer: msg`I work with CTOs and VPs of Engineering, directors, engineering managers, tech leads, and individual contributors preparing for their first leadership role.`,
  },
  {
    question: msg`What does engineering leadership coaching cover?`,
    answer: msg`Whatever stands between you and a team that delivers: scaling and org design, stakeholder and C-suite communication, delivery speed and DORA metrics, DevOps and GitOps workflows, hiring and performance frameworks, incident readiness, and executive presence.`,
  },
  {
    question: msg`Does Agustin coach remotely?`,
    answer: msg`Yes. I'm based in Berlin and coach leaders remotely worldwide. Sessions run in English, Spanish, or German — whichever you think best in.`,
  },
  {
    question: msg`How do I start working with Agustin?`,
    answer: msg`Book a free 30-minute intro call from this page or email me at info@agusgonzaleznic.com — no preparation needed. On that call we go through where you're stuck and whether coaching is the right tool; you'll leave with a concrete next step either way.`,
  },
];

export interface FaqItemField {
  question?: string;
  answer?: string;
}
export interface FaqBlock extends PageBlock {
  heading?: string;
  subheading?: string;
  faqs?: FaqItemField[];
}

/**
 * Resolve the Q&A list from EITHER the CMS block OR the hardcoded fallback,
 * localized for the active locale. Both the visible accordion (FAQ.tsx) and the
 * FAQPage JSON-LD (pages/Faq.tsx) call this, so the structured data stays
 * byte-identical to the visible answers in every locale (no cloaking).
 */
export function resolveFaqs(block: FaqBlock | undefined, i18n: I18n): { question: string; answer: string }[] {
  if (block?.faqs?.length) {
    return block.faqs.map((f) => ({ question: f.question ?? "", answer: f.answer ?? "" }));
  }
  return faqs.map((f) => ({ question: i18n._(f.question), answer: i18n._(f.answer) }));
}

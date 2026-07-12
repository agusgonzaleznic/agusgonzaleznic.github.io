import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Trans, useLingui } from "@lingui/react/macro";
import { msg } from "@lingui/core/macro";
import { SECTION_HEADER_MARGIN, SECTION_PADDING } from "@/lib/layout";

// Keep these answers in sync with the FAQPage JSON-LD in index.html so that
// what humans read matches what search and AI engines index (no cloaking).
// The English source strings below are the msgids, so the rendered English is
// byte-identical to the wording the prerender author mirrors into the JSON-LD.
const faqs = [
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

export const FAQ = () => {
  const { i18n } = useLingui();
  return (
    // Tinted bloom keeps the plain/tinted alternation going (testimonials and
    // contact are plain) — without it two plain sections sit adjacent and
    // their combined padding reads as one oversized gap.
    <section id="faq" className={`${SECTION_PADDING} bg-gradient-to-b from-background via-secondary/30 to-background`}>
      <div className="container px-6">
        <div className="max-w-3xl mx-auto">
          {/* Section header */}
          <div className={`text-center ${SECTION_HEADER_MARGIN} animate-fade-in-up`}>
            <h2 className="text-fluid-3xl font-bold mb-6"><Trans>Frequently Asked Questions</Trans></h2>
            <p className="text-fluid-lg text-muted-foreground">
              <Trans>Practical answers on fit, format, and how we'd start</Trans>
            </p>
          </div>

          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-left text-lg font-medium">
                  {i18n._(faq.question)}
                </AccordionTrigger>
                <AccordionContent className="text-base text-muted-foreground leading-relaxed">
                  {i18n._(faq.answer)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
};

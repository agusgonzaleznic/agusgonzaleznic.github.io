import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Trans, useLingui } from "@lingui/react/macro";
import { faqs } from "@/lib/faq-data";
import { SECTION_HEADER_MARGIN, SECTION_PADDING } from "@/lib/layout";

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
            <h1 className="text-fluid-3xl font-bold mb-6"><Trans>Frequently Asked Questions</Trans></h1>
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

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Trans, useLingui } from "@lingui/react/macro";
import { resolveFaqs, type FaqBlock } from "@/lib/faq-data";
import { SECTION_HEADER_MARGIN, SECTION_PADDING } from "@/lib/layout";

export const FAQ = ({ block }: { block?: FaqBlock }) => {
  const { i18n } = useLingui();
  if (block?.show_section === false) return null;
  const items = resolveFaqs(block, i18n);
  return (
    // Tinted bloom (see the plain/tinted alternation convention) — the /faq
    // page's single section reads better tinted between the plain nav/footer.
    <section id="faq" className={`${SECTION_PADDING} bg-gradient-to-b from-background via-secondary/30 to-background`}>
      <div className="container px-6">
        <div className="max-w-3xl mx-auto">
          {/* Section header */}
          <div className={`text-center ${SECTION_HEADER_MARGIN} animate-fade-in-up`}>
            <h1 className="text-fluid-3xl font-bold mb-6">
              {block?.heading ?? <Trans>Frequently Asked Questions</Trans>}
            </h1>
            <p className="text-fluid-lg text-muted-foreground">
              {block?.subheading ?? <Trans>Practical answers on fit, format, and how we'd start</Trans>}
            </p>
          </div>

          <Accordion type="single" collapsible className="w-full">
            {items.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-left text-lg font-medium">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-base text-muted-foreground leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
};

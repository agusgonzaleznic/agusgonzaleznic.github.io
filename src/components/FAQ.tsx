import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Keep these answers in sync with the FAQPage JSON-LD in index.html so that
// what humans read matches what search and AI engines index (no cloaking).
const faqs = [
  {
    question: "Who is Agustin Gonzalez Nicolini?",
    answer:
      "I'm an engineering leader and leadership coach based in Berlin, Germany. I've led engineering teams at companies including Ualá, Wildlife Studios, JUCR, and Bdev — most recently as VP of Engineering — and I now coach senior technology leaders one-on-one.",
  },
  {
    question: "Who does Agustin coach?",
    answer:
      "I work with CTOs and VPs of Engineering, directors, engineering managers, tech leads, and individual contributors preparing for their first leadership role.",
  },
  {
    question: "What does engineering leadership coaching cover?",
    answer:
      "Whatever stands between you and a team that delivers: scaling and org design, stakeholder and C-suite communication, delivery speed and DORA metrics, DevOps and GitOps workflows, hiring and performance frameworks, incident readiness, and executive presence.",
  },
  {
    question: "Does Agustin coach remotely?",
    answer:
      "Yes. I'm based in Berlin and coach leaders remotely worldwide. Sessions run in English, Spanish, or German — whichever you think best in.",
  },
  {
    question: "How do I start working with Agustin?",
    answer:
      "Book a free 30-minute intro call from this page or email me at info@agusgonzaleznic.com — no preparation needed. On that call we go through where you're stuck and whether coaching is the right tool; you'll leave with a concrete next step either way.",
  },
];

export const FAQ = () => {
  return (
    <section id="faq" className="py-24 md:py-32 bg-background">
      <div className="container px-6">
        <div className="max-w-3xl mx-auto">
          {/* Section header */}
          <div className="text-center mb-16 animate-fade-in-up">
            <h2 className="text-fluid-3xl font-bold mb-6">Frequently Asked Questions</h2>
            <p className="text-fluid-lg text-muted-foreground">
              Practical answers on fit, format, and how we'd start
            </p>
          </div>

          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={faq.question} value={`item-${index}`}>
                <AccordionTrigger className="text-left text-lg font-semibold">
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

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
      "Agustin Gonzalez Nicolini is a VP of Engineering and leadership coach based in Berlin, Germany, with 15+ years of experience leading engineering teams across fintech, gaming, e-mobility, and healthtech. He coaches CTOs, VPs, engineering managers, and tech leads.",
  },
  {
    question: "Who does Agustin coach?",
    answer:
      "Engineering leaders at every stage: CTOs and VPs of Engineering, directors, engineering managers, tech leads, and individual contributors transitioning into leadership roles.",
  },
  {
    question: "What does engineering leadership coaching cover?",
    answer:
      "Scaling teams, organization design, stakeholder and C-suite communication, DORA metrics and delivery velocity, DevOps/GitOps workflows, hiring and performance frameworks, incident readiness, and executive presence.",
  },
  {
    question: "Does Agustin coach remotely?",
    answer:
      "Yes. Agustin is based in Berlin and coaches engineering leaders remotely worldwide, in English, Spanish, or German.",
  },
  {
    question: "How do I start working with Agustin?",
    answer:
      "Every engagement starts with a complimentary 30-minute discovery call to make sure it's a good fit. You can book a session from this page or email info@agusgonzaleznic.com.",
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
              Everything you need to know about working with me
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

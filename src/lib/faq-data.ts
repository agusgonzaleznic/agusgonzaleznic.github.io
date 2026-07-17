import { msg } from "@lingui/core/macro";

// Single source of truth for both the visible FAQ accordion (src/components/FAQ.tsx)
// AND the FAQPage JSON-LD emitted on /faq (src/pages/Faq.tsx builds the schema
// from these same msg`` descriptors via i18n._(), so the structured data is
// byte-identical to what humans read — in every language, no cloaking).
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

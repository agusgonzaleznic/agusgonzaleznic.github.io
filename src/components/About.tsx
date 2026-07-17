import { Trans } from "@lingui/react/macro";
import { SECTION_PADDING } from "@/lib/layout";

// The "How I Work" values grid used to live here; it moved to
// src/components/HowIWork.tsx and now closes the /philosophy page.

export const About = () => {
  return (
    <section id="about" className={`${SECTION_PADDING} bg-background`}>
      <div className="container px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-3xl mx-auto animate-fade-in-up">
            <h1 className="text-fluid-3xl font-bold mb-6">
              <Trans>From Haedo to Berlin, One Engineering Team at a Time</Trans>
            </h1>
            <p className="text-fluid-lg text-muted-foreground leading-relaxed mb-6">
              <Trans>I'm Agustin Gonzalez Nicolini. For 15+ years I've built and led multi-disciplinary teams across fintech, gaming, e-mobility, healthtech, and web3 — shipping REST and GraphQL architectures on serverless and containerized cloud-native systems, including a core banking platform.</Trans>
            </p>
            <p className="text-fluid-lg text-muted-foreground leading-relaxed">
              <Trans>I advise C-suite and senior engineering leaders on cloud-native systems, DevOps transformation, and security — and I've likely sat through a version of whatever you're facing: the reorg, the audit, the outage review, the budget fight. Whether you're taking a startup through scale-up or restoring delivery discipline in an enterprise org, we build the systems and habits that let your team deliver without you as the bottleneck.</Trans>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

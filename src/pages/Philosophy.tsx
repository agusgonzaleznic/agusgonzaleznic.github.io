import { useLingui } from "@lingui/react/macro";
import { SeoPage } from "@/components/SeoPage";
import { Philosophy } from "@/components/Philosophy";
import { HowIWork } from "@/components/HowIWork";
import { RelatedPages } from "@/components/RelatedPages";
import { SITE_URL } from "@/lib/blog";

const PhilosophyPage = () => {
  const { t } = useLingui();
  return (
    <SeoPage
      path="/philosophy"
      title={t`Engineering Leadership Coaching Philosophy`}
      description={t`How I coach engineering leaders: clarity over noise, systems over heroics, and empathy that scales. The principles behind every session.`}
      crumb={t`Philosophy`}
      about={{ "@id": `${SITE_URL}/#person` }}
    >
      <Philosophy />
      <HowIWork />
      <RelatedPages page="philosophy" />
    </SeoPage>
  );
};

export default PhilosophyPage;

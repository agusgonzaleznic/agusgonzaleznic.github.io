import { useLingui } from "@lingui/react/macro";
import { SeoPage } from "@/components/SeoPage";
import { Philosophy } from "@/components/Philosophy";
import { HowIWork } from "@/components/HowIWork";

const PhilosophyPage = () => {
  const { t } = useLingui();
  return (
    <SeoPage
      path="/philosophy"
      title={t`Engineering Leadership Coaching Philosophy`}
      description={t`How I coach engineering leaders: clarity over noise, systems over heroics, and empathy that scales. The principles behind every session.`}
      crumb="Philosophy"
    >
      <Philosophy />
      <HowIWork />
    </SeoPage>
  );
};

export default PhilosophyPage;

import { useLingui } from "@lingui/react/macro";
import { SeoPage } from "@/components/SeoPage";
import { Impact } from "@/components/Impact";

const ImpactPage = () => {
  const { t } = useLingui();
  return (
    <SeoPage
      path="/impact"
      title={t`Coaching Impact & Results — Engineering Leadership`}
      description={t`The results engineering leaders get from coaching: faster delivery, lower attrition, and orgs that run without heroics. Numbers I stand behind.`}
      crumb="Impact"
    >
      <Impact />
    </SeoPage>
  );
};

export default ImpactPage;

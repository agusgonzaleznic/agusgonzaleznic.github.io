import { useLingui } from "@lingui/react/macro";
import { SeoPage } from "@/components/SeoPage";
import { Impact } from "@/components/Impact";

const ImpactPage = () => {
  const { t } = useLingui();
  return (
    <SeoPage
      path="/impact"
      title={t`Experience & Impact — Engineering Leadership Coaching`}
      description={t`My track record leading engineering orgs — and the results coaching delivers: faster delivery, lower attrition, and teams that run without heroics.`}
      crumb="Impact"
    >
      <Impact />
    </SeoPage>
  );
};

export default ImpactPage;

import { Trans } from "@lingui/react/macro";
import { Languages } from "lucide-react";

// Honest disclosure shown on machine-translated (FR/IT/PT) blog articles: the
// copy is auto-translated (DeepL + LLM post-edit), not natively reviewed. Links
// to the English original. Rendered in the reader's language via <Trans>.
// DE/ES articles are human-gated and never show this — see BlogPost.tsx +
// src/i18n/locales.ts (isAutoTranslated).
export const MachineTranslationNotice = ({ enUrl }: { enUrl: string }) => (
  <div
    role="note"
    className="mb-8 flex items-start gap-3 rounded-md border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground"
  >
    <Languages className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
    <p>
      <Trans>
        This article was translated automatically.{" "}
        <a
          href={enUrl}
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          Read the original in English
        </a>
        .
      </Trans>
    </p>
  </div>
);

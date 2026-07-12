import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Helmet } from "react-helmet";
import { Trans, useLingui } from "@lingui/react/macro";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { isAnalyticsConfigured, withdrawAnalyticsConsent } from "@/lib/analytics";
import { localeFromPath, LOCALE_META } from "@/i18n/locales";
import { SECTION_PADDING } from "@/lib/layout";

// Shared layout for the legal pages (/impressum and /privacy). Uses the same
// Navigation + Footer shell and typography tokens as the home page sections.
// Bracketed [ ... ] placeholders are intentionally visible: they mark legally
// required details (street address, VAT status) the site owner must fill in.

const LegalLayout = ({
  title,
  description,
  path,
  children,
}: {
  title: string;
  description: string;
  path: string;
  children: React.ReactNode;
}) => {
  const locale = localeFromPath(useLocation().pathname);
  return (
  <div className="min-h-screen">
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={`https://agusgonzaleznic.com${path}`} />
      <meta property="og:locale" content={LOCALE_META[locale].ogLocale} />
    </Helmet>
    <Navigation />
    <main className="pt-16">
      <section className="bg-background">
        <div className={`container px-6 ${SECTION_PADDING}`}>
          <div className="max-w-3xl mx-auto space-y-8">{children}</div>
        </div>
      </section>
    </main>
    <Footer />
  </div>
  );
};

const H1 = ({ children }: { children: React.ReactNode }) => (
  <h1 className="text-fluid-3xl font-bold mb-10">{children}</h1>
);

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-fluid-xl font-bold pt-4">{children}</h2>
);

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-base text-muted-foreground leading-relaxed">{children}</p>
);

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a
    href={href}
    target={href.startsWith("http") ? "_blank" : undefined}
    rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
    className="text-accent hover:underline break-words"
  >
    {children}
  </a>
);

const Note = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm text-muted-foreground italic pt-8 border-t border-border">
    {children}
  </p>
);

export const Impressum = () => {
  const { t } = useLingui();
  return (
  <LegalLayout
    title={t`Impressum — Agustin Gonzalez Nicolini`}
    description={t`Impressum (legal notice) for agusgonzaleznic.com pursuant to § 5 DDG.`}
    path="/impressum"
  >
    <H1><Trans>Impressum</Trans></H1>

    <H2><Trans>Angaben gemäß § 5 DDG</Trans></H2>
    <P>
      Agustin Gonzalez Nicolini
      <br />
      Coaching (sole proprietor / Einzelunternehmer)
      <br />
      [STREET ADDRESS REQUIRED — §5 DDG requires a physical address]
      <br />
      Berlin, Germany
    </P>

    <H2><Trans>Kontakt</Trans></H2>
    <P>
      Email: <A href="mailto:info@agusgonzaleznic.com">info@agusgonzaleznic.com</A>
    </P>

    <H2>VAT</H2>
    <P>
      [VAT ID or note "Kleinunternehmer" if applicable — e.g. "Not subject to
      VAT pursuant to § 19 UStG (Kleinunternehmerregelung)" or "USt-IdNr.:
      DE…"]
    </P>

    <H2><Trans>Verantwortlich i.S.d. § 18 Abs. 2 MStV</Trans></H2>
    <P>
      Agustin Gonzalez Nicolini
      <br />
      [STREET ADDRESS REQUIRED — §5 DDG requires a physical address]
      <br />
      Berlin, Germany
    </P>

    <H2><Trans>Dispute Resolution</Trans></H2>
    <P>
      <Trans>
        The European Commission provides a platform for online dispute resolution
        (ODR): <A href="https://ec.europa.eu/consumers/odr/">https://ec.europa.eu/consumers/odr/</A>.
        I am neither obliged nor willing to participate in dispute resolution
        proceedings before a consumer arbitration board
        (Verbraucherschlichtungsstelle).
      </Trans>
    </P>

    <H2><Trans>Liability for Content and Links</Trans></H2>
    <P>
      <Trans>
        As a service provider, I am responsible for my own content on these pages
        in accordance with general laws (§ 7 Abs. 1 DDG). This website contains
        links to external third-party websites, over whose content I have no
        influence; the respective provider or operator is always responsible for
        the content of linked pages.
      </Trans>
    </P>

    <Note>
      <Trans>
        As of July 2026 — reviewed by the site owner. This page was drafted with
        assistance and is not legal advice.
      </Trans>
    </Note>
  </LegalLayout>
  );
};

// Rendered only when GA4 is configured: withdraws analytics consent right
// where the processing is described (Art. 7(3) GDPR — withdrawing must be as
// easy as consenting). withdrawAnalyticsConsent() also halts a running tag
// immediately and makes the consent banner ask again on the next visit.
const WithdrawAnalyticsConsent = () => {
  const [withdrawn, setWithdrawn] = useState(false);

  if (withdrawn) {
    return (
      <P>
        <Trans>
          <strong>Consent withdrawn.</strong> Analytics has stopped and the _ga
          cookies have been removed. The consent banner will ask again on your
          next visit.
        </Trans>
      </P>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          withdrawAnalyticsConsent();
          setWithdrawn(true);
        }}
        className="rounded-lg border-2 border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
      >
        <Trans>Withdraw analytics consent</Trans>
      </button>
      <p className="pt-2 text-sm text-muted-foreground leading-relaxed">
        <Trans>After withdrawing, the consent banner will reappear on your next visit.</Trans>
      </p>
    </div>
  );
};

export const Privacy = () => {
  const { t } = useLingui();
  return (
  <LegalLayout
    title={t`Privacy Policy — Agustin Gonzalez Nicolini`}
    description={t`Privacy policy for agusgonzaleznic.com: how personal data is processed under the GDPR.`}
    path="/privacy"
  >
    <H1><Trans>Privacy Policy</Trans></H1>

    <P>
      <Trans>
        This privacy policy explains how personal data is processed when you
        visit this website, in accordance with the EU General Data Protection
        Regulation (GDPR).
      </Trans>
    </P>

    <H2><Trans>1. Controller</Trans></H2>
    <P>
      Agustin Gonzalez Nicolini
      <br />
      [STREET ADDRESS REQUIRED — §5 DDG requires a physical address]
      <br />
      Berlin, Germany
      <br />
      Email: <A href="mailto:info@agusgonzaleznic.com">info@agusgonzaleznic.com</A>
    </P>

    <H2><Trans>2. Hosting and Server Logs</Trans></H2>
    <P>
      <Trans>
        This website is a static site hosted on <strong>GitHub Pages</strong>{" "}
        (GitHub, Inc., USA) and delivered via <strong>Amazon CloudFront</strong>{" "}
        (Amazon Web Services), a content delivery network. When you access the
        site, these providers process connection data as a technical necessity —
        in particular your IP address, date and time of the request, browser
        type, operating system, and the pages accessed — in server logs to
        deliver the site and ensure its security and stability.
      </Trans>
    </P>
    <P>
      <Trans>
        Legal basis: Art. 6(1)(f) GDPR (legitimate interest in the secure,
        reliable provision of this website). Log data may be processed on servers
        in the United States; GitHub and AWS rely on the EU–US Data Privacy
        Framework and/or EU Standard Contractual Clauses for such transfers. I do
        not merge this data with other sources or use it to identify visitors.
      </Trans>
    </P>

    <H2><Trans>3. Contact Form</Trans></H2>
    <P>
      <Trans>
        If you use the contact form, the data you enter (name, email address,
        role, and message) is transmitted via a{" "}
        <strong>Google Apps Script</strong> endpoint (Google LLC / Google Ireland
        Ltd.) and forwarded to me by email. The data is not stored in any
        database; it exists only in the resulting email correspondence.
      </Trans>
    </P>
    <P>
      <Trans>
        Legal basis: Art. 6(1)(b) GDPR (steps prior to entering into a contract /
        responding to your inquiry) and, where the inquiry is not
        contract-related, Art. 6(1)(a) GDPR (your consent, given by voluntarily
        submitting the form). You may withdraw consent at any time with effect
        for the future by emailing{" "}
        <A href="mailto:info@agusgonzaleznic.com">info@agusgonzaleznic.com</A>.
      </Trans>
    </P>
    <P>
      <Trans>
        Google acts as a processor in this transmission. Data may be transferred
        to Google servers in the United States; Google is certified under the
        EU–US Data Privacy Framework.
      </Trans>
    </P>
    <P>
      <Trans>
        <strong>Retention:</strong> Contact inquiries and the related emails are
        kept only as long as needed to handle your inquiry and any follow-up, and
        are then deleted, unless statutory retention obligations require longer
        storage.
      </Trans>
    </P>

    <H2><Trans>4. Fonts</Trans></H2>
    <P>
      <Trans>
        The fonts used on this website are <strong>self-hosted</strong>: they are
        served directly from this website's own domain as part of the site
        itself. Loading them causes no request to Google or any other third-party
        font service, and no data about you is transmitted to a font provider.
      </Trans>
    </P>

    <H2><Trans>5. Booking Link (Google Calendar)</Trans></H2>
    <P>
      <Trans>
        The site links to an external booking page at{" "}
        <strong>calendar.app.google</strong> (Google Appointment Scheduling). No
        data is transmitted to Google by merely viewing this website; only when
        you click the link and use the booking page does Google process the data
        you enter there, under Google's own privacy policy and as an independent
        controller. Legal basis for any data I receive from a booking (name,
        email, chosen time): Art. 6(1)(b) GDPR.
      </Trans>
    </P>

    <H2><Trans>6. Cookies, Analytics, and Tracking</Trans></H2>
    {isAnalyticsConfigured() ? (
      <>
        <P>
          <Trans>
            This website uses <strong>Google Analytics 4</strong> (Google Ireland
            Ltd. / Google LLC) — but <strong>only if you accept it</strong> in
            the consent banner. Before you accept (and always if you decline),
            no analytics script is loaded, no request is made to Google, and no
            analytics cookies are set. The purpose is to understand, in
            aggregate, how the site is used (e.g. which pages are visited) so it
            can be improved.
          </Trans>
        </P>
        <P>
          <Trans>
            Google's <strong>Consent Mode v2</strong> is used: every consent
            signal defaults to "denied", and only the analytics-storage signal is
            set to "granted" after you accept — advertising signals remain
            denied. Google Analytics 4 does not log or store IP addresses; IP
            data is used only transiently to derive coarse location. If you
            accept, Google Analytics
            sets the cookies <strong>_ga</strong> and <strong>_ga_*</strong>{" "}
            (lifetime of up to two years) to distinguish visitors. Analytics
            event data is retained in Google Analytics for at most 14 months and
            is then deleted automatically.
          </Trans>
        </P>
        <P>
          <Trans>
            Legal basis: Art. 6(1)(a) GDPR (your consent, given via the banner).
            You can withdraw your consent at any time with effect for the
            future:
          </Trans>
        </P>
        <WithdrawAnalyticsConsent />
        <P>
          <Trans>
            Google acts as a processor for this measurement. Data may be
            transferred to Google servers in the United States; Google is
            certified under the EU–US Data Privacy Framework and additionally
            relies on EU Standard Contractual Clauses. Details:{" "}
            <A href="https://policies.google.com/privacy">https://policies.google.com/privacy</A>
          </Trans>
        </P>
        <P>
          <Trans>
            Beyond this, the website sets no cookies of its own. Website content
            is fetched from the Storyblok CMS only at build time — no visitor
            data is sent to Storyblok.
          </Trans>
        </P>
      </>
    ) : (
      <P>
        <Trans>
          This website sets <strong>no cookies</strong> of its own and uses{" "}
          <strong>no analytics or tracking tools</strong>. Website content is
          fetched from the Storyblok CMS only at build time — no visitor data is
          sent to Storyblok.
        </Trans>
      </P>
    )}

    <H2><Trans>7. Your Rights</Trans></H2>
    <P><Trans>Under the GDPR you have the right to:</Trans></P>
    <ul className="list-disc pl-6 space-y-2 text-base text-muted-foreground leading-relaxed">
      <li><Trans>access your personal data (Art. 15),</Trans></li>
      <li><Trans>rectification (Art. 16),</Trans></li>
      <li><Trans>erasure (Art. 17),</Trans></li>
      <li><Trans>restriction of processing (Art. 18),</Trans></li>
      <li><Trans>data portability (Art. 20),</Trans></li>
      <li><Trans>object to processing based on legitimate interests (Art. 21), and</Trans></li>
      <li>
        <Trans>
          withdraw any consent at any time with effect for the future (Art.
          7(3)).
        </Trans>
      </li>
    </ul>
    <P>
      <Trans>
        To exercise these rights, contact{" "}
        <A href="mailto:info@agusgonzaleznic.com">info@agusgonzaleznic.com</A>.
      </Trans>
    </P>
    <P>
      <Trans>
        You also have the right to lodge a complaint with a data protection
        supervisory authority (Art. 77 GDPR). The authority responsible for this
        website's operator is:
      </Trans>
    </P>
    <P>
      <strong>
        Berliner Beauftragte für Datenschutz und Informationsfreiheit (BlnBDI)
      </strong>
      <br />
      Alt-Moabit 59–61, 10555 Berlin, Germany —{" "}
      <A href="https://www.datenschutz-berlin.de">https://www.datenschutz-berlin.de</A>
    </P>

    <H2><Trans>8. Data Security and Obligation to Provide Data</Trans></H2>
    <P>
      <Trans>
        The site is served over HTTPS. You are not legally or contractually
        obliged to provide personal data; however, without contact details I
        cannot respond to inquiries.
      </Trans>
    </P>

    <Note>
      <Trans>
        As of July 2026 — reviewed by the site owner. This page was drafted with
        assistance and is not legal advice.
      </Trans>
    </Note>
  </LegalLayout>
  );
};

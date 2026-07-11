import { useState } from "react";
import { Helmet } from "react-helmet";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { isAnalyticsConfigured, withdrawAnalyticsConsent } from "@/lib/analytics";
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
}) => (
  <div className="min-h-screen">
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={`https://agusgonzaleznic.com${path}`} />
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

export const Impressum = () => (
  <LegalLayout
    title="Impressum — Agustin Gonzalez Nicolini"
    description="Impressum (legal notice) for agusgonzaleznic.com pursuant to § 5 DDG."
    path="/impressum"
  >
    <H1>Impressum</H1>

    <H2>Angaben gemäß § 5 DDG</H2>
    <P>
      Agustin Gonzalez Nicolini
      <br />
      Coaching (sole proprietor / Einzelunternehmer)
      <br />
      [STREET ADDRESS REQUIRED — §5 DDG requires a physical address]
      <br />
      Berlin, Germany
    </P>

    <H2>Kontakt</H2>
    <P>
      Email: <A href="mailto:info@agusgonzaleznic.com">info@agusgonzaleznic.com</A>
    </P>

    <H2>VAT</H2>
    <P>
      [VAT ID or note "Kleinunternehmer" if applicable — e.g. "Not subject to
      VAT pursuant to § 19 UStG (Kleinunternehmerregelung)" or "USt-IdNr.:
      DE…"]
    </P>

    <H2>Verantwortlich i.S.d. § 18 Abs. 2 MStV</H2>
    <P>
      Agustin Gonzalez Nicolini
      <br />
      [STREET ADDRESS REQUIRED — §5 DDG requires a physical address]
      <br />
      Berlin, Germany
    </P>

    <H2>Dispute Resolution</H2>
    <P>
      The European Commission provides a platform for online dispute resolution
      (ODR): <A href="https://ec.europa.eu/consumers/odr/">https://ec.europa.eu/consumers/odr/</A>.
      I am neither obliged nor willing to participate in dispute resolution
      proceedings before a consumer arbitration board
      (Verbraucherschlichtungsstelle).
    </P>

    <H2>Liability for Content and Links</H2>
    <P>
      As a service provider, I am responsible for my own content on these pages
      in accordance with general laws (§ 7 Abs. 1 DDG). This website contains
      links to external third-party websites, over whose content I have no
      influence; the respective provider or operator is always responsible for
      the content of linked pages.
    </P>

    <Note>
      As of July 2026 — reviewed by the site owner. This page was drafted with
      assistance and is not legal advice.
    </Note>
  </LegalLayout>
);

// Rendered only when GA4 is configured: withdraws analytics consent right
// where the processing is described (Art. 7(3) GDPR — withdrawing must be as
// easy as consenting). withdrawAnalyticsConsent() also halts a running tag
// immediately and makes the consent banner ask again on the next visit.
const WithdrawAnalyticsConsent = () => {
  const [withdrawn, setWithdrawn] = useState(false);

  if (withdrawn) {
    return (
      <P>
        <strong>Consent withdrawn.</strong> Analytics has stopped and the _ga
        cookies have been removed. The consent banner will ask again on your
        next visit.
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
        Withdraw analytics consent
      </button>
      <p className="pt-2 text-sm text-muted-foreground leading-relaxed">
        After withdrawing, the consent banner will reappear on your next visit.
      </p>
    </div>
  );
};

export const Privacy = () => (
  <LegalLayout
    title="Privacy Policy — Agustin Gonzalez Nicolini"
    description="Privacy policy for agusgonzaleznic.com: how personal data is processed under the GDPR."
    path="/privacy"
  >
    <H1>Privacy Policy</H1>

    <P>
      This privacy policy explains how personal data is processed when you
      visit this website, in accordance with the EU General Data Protection
      Regulation (GDPR).
    </P>

    <H2>1. Controller</H2>
    <P>
      Agustin Gonzalez Nicolini
      <br />
      [STREET ADDRESS REQUIRED — §5 DDG requires a physical address]
      <br />
      Berlin, Germany
      <br />
      Email: <A href="mailto:info@agusgonzaleznic.com">info@agusgonzaleznic.com</A>
    </P>

    <H2>2. Hosting and Server Logs</H2>
    <P>
      This website is a static site hosted on <strong>GitHub Pages</strong>{" "}
      (GitHub, Inc., USA) and delivered via <strong>Amazon CloudFront</strong>{" "}
      (Amazon Web Services), a content delivery network. When you access the
      site, these providers process connection data as a technical necessity —
      in particular your IP address, date and time of the request, browser
      type, operating system, and the pages accessed — in server logs to
      deliver the site and ensure its security and stability.
    </P>
    <P>
      Legal basis: Art. 6(1)(f) GDPR (legitimate interest in the secure,
      reliable provision of this website). Log data may be processed on servers
      in the United States; GitHub and AWS rely on the EU–US Data Privacy
      Framework and/or EU Standard Contractual Clauses for such transfers. I do
      not merge this data with other sources or use it to identify visitors.
    </P>

    <H2>3. Contact Form</H2>
    <P>
      If you use the contact form, the data you enter (name, email address,
      role, and message) is transmitted via a{" "}
      <strong>Google Apps Script</strong> endpoint (Google LLC / Google Ireland
      Ltd.) and forwarded to me by email. The data is not stored in any
      database; it exists only in the resulting email correspondence.
    </P>
    <P>
      Legal basis: Art. 6(1)(b) GDPR (steps prior to entering into a contract /
      responding to your inquiry) and, where the inquiry is not
      contract-related, Art. 6(1)(a) GDPR (your consent, given by voluntarily
      submitting the form). You may withdraw consent at any time with effect
      for the future by emailing{" "}
      <A href="mailto:info@agusgonzaleznic.com">info@agusgonzaleznic.com</A>.
    </P>
    <P>
      Google acts as a processor in this transmission. Data may be transferred
      to Google servers in the United States; Google is certified under the
      EU–US Data Privacy Framework.
    </P>
    <P>
      <strong>Retention:</strong> Contact inquiries and the related emails are
      kept only as long as needed to handle your inquiry and any follow-up, and
      are then deleted, unless statutory retention obligations require longer
      storage.
    </P>

    <H2>4. Fonts</H2>
    <P>
      The fonts used on this website are <strong>self-hosted</strong>: they are
      served directly from this website's own domain as part of the site
      itself. Loading them causes no request to Google or any other third-party
      font service, and no data about you is transmitted to a font provider.
    </P>

    <H2>5. Booking Link (Google Calendar)</H2>
    <P>
      The site links to an external booking page at{" "}
      <strong>calendar.app.google</strong> (Google Appointment Scheduling). No
      data is transmitted to Google by merely viewing this website; only when
      you click the link and use the booking page does Google process the data
      you enter there, under Google's own privacy policy and as an independent
      controller. Legal basis for any data I receive from a booking (name,
      email, chosen time): Art. 6(1)(b) GDPR.
    </P>

    <H2>6. Cookies, Analytics, and Tracking</H2>
    {isAnalyticsConfigured() ? (
      <>
        <P>
          This website uses <strong>Google Analytics 4</strong> (Google Ireland
          Ltd. / Google LLC) — but <strong>only if you accept it</strong> in
          the consent banner. Before you accept (and always if you decline),
          no analytics script is loaded, no request is made to Google, and no
          analytics cookies are set. The purpose is to understand, in
          aggregate, how the site is used (e.g. which pages are visited) so it
          can be improved.
        </P>
        <P>
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
        </P>
        <P>
          Legal basis: Art. 6(1)(a) GDPR (your consent, given via the banner).
          You can withdraw your consent at any time with effect for the
          future:
        </P>
        <WithdrawAnalyticsConsent />
        <P>
          Google acts as a processor for this measurement. Data may be
          transferred to Google servers in the United States; Google is
          certified under the EU–US Data Privacy Framework and additionally
          relies on EU Standard Contractual Clauses. Details:{" "}
          <A href="https://policies.google.com/privacy">https://policies.google.com/privacy</A>
        </P>
        <P>
          Beyond this, the website sets no cookies of its own. Website content
          is fetched from the Storyblok CMS only at build time — no visitor
          data is sent to Storyblok.
        </P>
      </>
    ) : (
      <P>
        This website sets <strong>no cookies</strong> of its own and uses{" "}
        <strong>no analytics or tracking tools</strong>. Website content is
        fetched from the Storyblok CMS only at build time — no visitor data is
        sent to Storyblok.
      </P>
    )}

    <H2>7. Your Rights</H2>
    <P>Under the GDPR you have the right to:</P>
    <ul className="list-disc pl-6 space-y-2 text-base text-muted-foreground leading-relaxed">
      <li>access your personal data (Art. 15),</li>
      <li>rectification (Art. 16),</li>
      <li>erasure (Art. 17),</li>
      <li>restriction of processing (Art. 18),</li>
      <li>data portability (Art. 20),</li>
      <li>object to processing based on legitimate interests (Art. 21), and</li>
      <li>
        withdraw any consent at any time with effect for the future (Art.
        7(3)).
      </li>
    </ul>
    <P>
      To exercise these rights, contact{" "}
      <A href="mailto:info@agusgonzaleznic.com">info@agusgonzaleznic.com</A>.
    </P>
    <P>
      You also have the right to lodge a complaint with a data protection
      supervisory authority (Art. 77 GDPR). The authority responsible for this
      website's operator is:
    </P>
    <P>
      <strong>
        Berliner Beauftragte für Datenschutz und Informationsfreiheit (BlnBDI)
      </strong>
      <br />
      Alt-Moabit 59–61, 10555 Berlin, Germany —{" "}
      <A href="https://www.datenschutz-berlin.de">https://www.datenschutz-berlin.de</A>
    </P>

    <H2>8. Data Security and Obligation to Provide Data</H2>
    <P>
      The site is served over HTTPS. You are not legally or contractually
      obliged to provide personal data; however, without contact details I
      cannot respond to inquiries.
    </P>

    <Note>
      As of July 2026 — reviewed by the site owner. This page was drafted with
      assistance and is not legal advice.
    </Note>
  </LegalLayout>
);

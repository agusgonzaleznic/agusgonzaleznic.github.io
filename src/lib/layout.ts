// Shared vertical rhythm for page sections. Tailwind's scanner only keeps
// classes it sees as literal strings, so these constants must stay full
// literals — never build them from templates or fragments.
export const SECTION_PADDING = "py-16 md:py-24";
export const SECTION_HEADER_MARGIN = "mb-10 md:mb-12";

// DOM ids of the inline CTA affordances (the hero's booking button block and
// the contact form's submit button). Navigation's IntersectionObserver hides
// the mobile sticky CTA while either is in view — the buttons themselves, not
// their whole sections, so the sticky CTA stays available while a section's
// intro is on screen but its action is not.
export const HERO_CTA_ID = "hero-cta";
export const CONTACT_CTA_ID = "contact-cta";

// Tiny external store: whether the mobile sticky "Book a Session" CTA is
// currently rendered. Navigation owns the value; CookieNotice reads it (via
// useSyncExternalStore) so the consent banner sits directly above the CTA
// only when the CTA actually exists — both are fixed to the viewport bottom.
type StickyCtaListener = () => void;
let stickyCtaVisible = false;
const stickyCtaListeners = new Set<StickyCtaListener>();

export const getStickyCtaVisible = (): boolean => stickyCtaVisible;

export const setStickyCtaVisible = (visible: boolean): void => {
  if (visible === stickyCtaVisible) return;
  stickyCtaVisible = visible;
  stickyCtaListeners.forEach((listener) => listener());
};

export const subscribeStickyCtaVisible = (
  listener: StickyCtaListener,
): (() => void) => {
  stickyCtaListeners.add(listener);
  return () => stickyCtaListeners.delete(listener);
};

// Shared vertical rhythm for page sections. Tailwind's scanner only keeps
// classes it sees as literal strings, so these constants must stay full
// literals — never build them from templates or fragments.
export const SECTION_PADDING = "py-16 md:py-24";
// For a section that directly FOLLOWS another on the same page: the top
// padding is halved so the inter-section gap (previous pb + this pt) stays
// compact instead of doubling up. Use this on every stacked follower so the
// rhythm is consistent across pages.
export const SECTION_PADDING_STACKED = "pt-8 md:pt-12 pb-16 md:pb-24";
export const SECTION_HEADER_MARGIN = "mb-10 md:mb-12";

// DOM ids of the inline BOOKING affordances (the contact form's submit button
// and the Services bottom "Book an Intro Call" CTA). Navigation's
// IntersectionObserver hides the mobile sticky CTA while one is in view — the
// buttons themselves, not their whole sections, so the sticky CTA stays
// available while a section's intro is on screen but its action is not. Pages
// without any inline booking affordance always show the sticky CTA.
export const CONTACT_CTA_ID = "contact-cta";
export const SERVICES_CTA_ID = "services-cta";

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

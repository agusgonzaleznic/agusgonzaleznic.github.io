// Respect the user's reduced-motion preference for JS-driven scrolling.
//
// The CSS block in index.css can only neutralise animation/transition
// durations; it cannot override a `behavior: "smooth"` passed to
// window.scrollTo / Element.scrollIntoView, so those call sites have to ask.
// SSR-safe: both callers live in modules the prerender's server bundle imports,
// where `window` does not exist.
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** ScrollBehavior honouring the reduced-motion preference. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}

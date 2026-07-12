import { forwardRef } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { useLocalizedTo } from "@/i18n/useLocalizedTo";

// Drop-in <Link> that preserves the current locale prefix, so navigating within
// a localized page (e.g. /de/) doesn't fall back to the English route and drop
// the visitor's language. Non-string `to` (rare) is passed through unchanged.
// The path-prefixing logic lives in useLocalizedTo (also used by imperative
// navigate() calls).
export const LocaleLink = forwardRef<HTMLAnchorElement, LinkProps>(function LocaleLink(
  { to, ...props },
  ref,
) {
  const localize = useLocalizedTo();
  return <Link ref={ref} to={typeof to === "string" ? localize(to) : to} {...props} />;
});

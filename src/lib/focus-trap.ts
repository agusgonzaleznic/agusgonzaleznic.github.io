import { useEffect, type RefObject } from "react";

// Focus management for the mobile-nav overlay.
//
// That panel is a plain `fixed inset-0` div rendered as a SIBLING of <nav>,
// before <main>, so with it open, Tab walked straight out of the menu and into
// the page underneath, where the focus ring is invisible behind an opaque
// backdrop. A keyboard user could not tell where they were, and there was no way
// to close the menu without a pointer.
//
// Deliberately hand-rolled rather than swapping in Radix Dialog: that would
// change the markup and visual behaviour of the menu for an accessibility fix,
// and the requirement here is small and well-defined.
//
// NOTE: this cannot be unit-tested in this repo; there is no jsdom/React test
// setup, and adding one is a bigger change than the fix. It is verified
// structurally (the dialog attributes appear in the built HTML) and by hand in a
// browser. Stated plainly rather than implied.

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * While `active`, keep Tab focus inside `container`, move focus into it on open,
 * restore focus to whatever was focused before on close, and call `onClose` on
 * Escape.
 */
export function useFocusTrap(
  active: boolean,
  container: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    if (!active) return;
    const el = container.current;
    if (!el) return;

    // Remember where focus came from so it can be handed back. Without this,
    // closing the menu drops focus to <body> and the next Tab starts from the
    // top of the document.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusable = () =>
      Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        // offsetParent is null for anything display:none. The language
        // switcher keeps its anchors in the DOM when collapsed, so they must not
        // be counted as trap boundaries.
        (n) => n.offsetParent !== null || n === document.activeElement,
      );

    focusable()[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const nodes = focusable();
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];

      // Wrap at both ends. Also covers the case where focus has somehow escaped
      // the container already (e.g. a click on the backdrop): pull it back.
      if (!el.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Only restore if the element is still in the document: a locale switch
      // unmounts the whole tree.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [active, container, onClose]);
}

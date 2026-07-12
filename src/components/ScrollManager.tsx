import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// SPA scroll + URL-cleanliness policy (owner preference: bare paths only —
// never a lingering #fragment; fragments are SEO-neutral, this is UX):
//
//  1. New navigations (PUSH/REPLACE) open at the top — without this the
//     browser keeps the previous page's scroll offset, so entering the short
//     blog from a deeply-scrolled home landed at the blog's very end.
//  2. Back/forward (POP) restores that history entry's last scroll position
//     (saved per location.key in sessionStorage, so it survives reloads).
//  3. Cross-page section links navigate with router state { scrollTo: id }
//     instead of /#id anchors, then smooth-scroll here — the URL stays "/".
//  4. A hash that still arrives (external deep link) is honored — scroll to
//     the target — then stripped from the address bar.
//
// TIMING SUBTLETY (this is why layout effects, and why positions are saved
// only from scroll events, never at effect cleanup): navigating to a SHORTER
// page clamps window.scrollY at DOM-swap time, before any effect runs. A
// cleanup that reads scrollY would record the clamped value and corrupt the
// old entry's saved position. Instead the listener saves continuously while
// its entry is active; the listener swap and the restore both run in layout
// effects — synchronously after commit, before paint and before the clamp's
// (async) scroll event can be delivered to the wrong entry's listener.

export type ScrollToState = { scrollTo?: string; localeSwitch?: boolean } | null;

const keyFor = (key: string) => `scroll:${key}`;

// renderToString warns on useLayoutEffect; effects never run during SSR anyway.
const useClientLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export const ScrollManager = () => {
  const location = useLocation();
  const navType = useNavigationType();
  // True only for the first render after a full document load (react-router
  // reports POP + reuses location.key "default" then, so we can't trust navType
  // alone — see the restore effect).
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    window.history.scrollRestoration = "manual";
  }, []);

  // Save this entry's position on every scroll (rAF-throttled).
  useClientLayoutEffect(() => {
    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        try {
          sessionStorage.setItem(keyFor(location.key), String(window.scrollY));
        } catch {
          // storage blocked — restoration degrades to top; rule 1 still holds
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [location.key]);

  // Declared after the save effect so its listener is attached (and the old
  // one detached) before this runs on each navigation.
  useClientLayoutEffect(() => {
    // "instant" overrides the global html{scroll-behavior:smooth} so top-jumps
    // and restores don't animate across thousands of pixels.
    const instant = { behavior: "instant" as ScrollBehavior };

    const firstRender = isFirstRenderRef.current;
    isFirstRenderRef.current = false;

    const state = location.state as ScrollToState;

    // Language switch (LanguageSwitcher's client-side navigate): keep the reader
    // exactly where they are — same layout, only the text language changed.
    // Clear the state so a later POP to this entry doesn't re-run this.
    if (state?.localeSwitch) {
      window.history.replaceState({ ...window.history.state, usr: null }, "");
      return;
    }

    if (state?.scrollTo) {
      const el = document.getElementById(state.scrollTo);
      // Drop the state in place (react-router keeps it under history.state.usr)
      // so a refresh or a later POP to this entry doesn't re-run the scroll.
      window.history.replaceState({ ...window.history.state, usr: null }, "");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        return;
      }
    }

    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) el.scrollIntoView(instant);
      window.history.replaceState(
        window.history.state,
        "",
        location.pathname + location.search,
      );
      if (el) return;
    }

    // On the FIRST render (a full document load) react-router reports POP and
    // reuses location.key "default", so restoring by key would apply the
    // PREVIOUS page's saved offset to this URL — that is exactly why a
    // full-reload language switch (a real <a href> nav) dumped you at the bottom
    // of the new page. On a fresh navigation, open at the top; only restore for a
    // genuine reload or browser back/forward document load. In-session
    // navigations use the real navigation type.
    const navEntry = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    const restorePosition = firstRender
      ? navEntry?.type === "reload" || navEntry?.type === "back_forward"
      : navType === "POP";
    if (restorePosition) {
      let saved: string | null = null;
      try {
        saved = sessionStorage.getItem(keyFor(location.key));
      } catch {
        /* storage blocked */
      }
      window.scrollTo({ top: saved ? Number(saved) : 0, ...instant });
      return;
    }

    window.scrollTo({ top: 0, ...instant });
    // location.key changes on every navigation, including same-path pushes.
     
  }, [location.key]);

  return null;
};

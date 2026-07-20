import { lazy, Suspense } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import { I18nProvider } from "@lingui/react";
import Index from "./pages/Index";
import { CookieNotice } from "./components/CookieNotice";
import { ScrollManager } from "./components/ScrollManager";
import { i18n } from "./i18n/i18n";
import { PUBLISHED_LOCALES, SOURCE_LOCALE } from "./i18n/locales";

const queryClient = new QueryClient();

// The page components used by the route table. Passed in so the CLIENT can use
// lazy (code-split) chunks while the SERVER (prerender) uses eager imports —
// renderToString must emit full markup synchronously. See entry-server.tsx.
export type RoutePages = {
  Index: React.ComponentType;
  About: React.ComponentType;
  Philosophy: React.ComponentType;
  Services: React.ComponentType;
  Impact: React.ComponentType;
  Faq: React.ComponentType;
  Contact: React.ComponentType;
  Blog: React.ComponentType;
  BlogPost: React.ComponentType;
  Impressum: React.ComponentType;
  Privacy: React.ComponentType;
  StoryblokPage: React.ComponentType<{ slug?: string }>;
  NotFound: React.ComponentType;
};

// Client map: Index stays EAGER (it is the prerendered homepage and the
// hydration entry point). Every other route is a lazy chunk, so the homepage no
// longer downloads blog/legal code it never runs. Because <Suspense> lives in
// the SHARED AppRoutes, the server emits matching Suspense boundary markers
// around its eager-rendered content, so on a direct hit to /blog etc. React 18
// keeps the prerendered markup while the lazy chunk loads (no flash, no
// re-render) instead of discarding it.
const clientPages: RoutePages = {
  Index,
  About: lazy(() => import("./pages/About")),
  Philosophy: lazy(() => import("./pages/Philosophy")),
  Services: lazy(() => import("./pages/Services")),
  Impact: lazy(() => import("./pages/Impact")),
  Faq: lazy(() => import("./pages/Faq")),
  Contact: lazy(() => import("./pages/Contact")),
  Blog: lazy(() => import("./pages/Blog")),
  BlogPost: lazy(() => import("./pages/BlogPost")),
  Impressum: lazy(() => import("./pages/Legal").then((m) => ({ default: m.Impressum }))),
  Privacy: lazy(() => import("./pages/Legal").then((m) => ({ default: m.Privacy }))),
  StoryblokPage: lazy(() =>
    import("./pages/StoryblokPage").then((m) => ({ default: m.StoryblokPage })),
  ),
  NotFound: lazy(() => import("./pages/NotFound")),
};

// Extracts the story full_slug for the Storyblok preview route from the splat
// param, so nested paths like "blog/<slug>" and "pages/<slug>" are captured
// (a single ":slug" segment can't). Module-level (not nested) so it keeps a
// stable component identity across renders.
const PreviewSlug = ({ Comp }: { Comp: React.ComponentType<{ slug?: string }> }) => {
  const params = useParams();
  const fullSlug = (params["*"] || "").replace(/^\/+|\/+$/g, "");
  return <Comp slug={fullSlug || "home"} />;
};

// Shared providers/shell. Rendered identically on the server (prerender) and the
// client (hydration), so the markup matches and React can hydrate cleanly.
//
// <I18nProvider> supplies the shared Lingui instance (the global singleton from
// ./i18n/i18n) to <Trans>/useLingui() consumers. It renders a Fragment (no DOM
// node), so the markup is unaffected. The ACTIVE locale is not held here — it is
// activated on `i18n` before render/hydrate (server: prerender loop; client:
// main.tsx), derived from the URL prefix so both sides agree.
//
// <Sonner> is the toast container the contact form pushes into (Contact.tsx uses
// `toast()` from "sonner"). The Radix <Toaster>/<TooltipProvider> were removed —
// nothing rendered a toast via the Radix hook or a <Tooltip>, so they were dead
// weight (and pulled @radix-ui/react-toast + react-tooltip into the vendor chunk).
export const AppProviders = ({ children }: { children: React.ReactNode }) => (
  <I18nProvider i18n={i18n}>
    <QueryClientProvider client={queryClient}>
      <Sonner />
      {children}
      <CookieNotice />
    </QueryClientProvider>
  </I18nProvider>
);

// The public routes, reused verbatim under each locale prefix. English keeps the
// existing ROOT routes (absolute paths) untouched; prefixed locales mount the
// same page components under /{locale}. The active locale is derived from the
// URL prefix, so a single set of page components serves every locale.
const PREFIXED_LOCALES = PUBLISHED_LOCALES.filter((l) => l !== SOURCE_LOCALE);

// Route table, router-agnostic so it can sit under BrowserRouter (client) or
// StaticRouter (server prerender). `pages` swaps eager (server) vs lazy (client)
// implementations. The <Suspense> wraps <Routes> in BOTH trees so the server and
// client Suspense boundaries match (see clientPages).
export const AppRoutes = ({ pages }: { pages: RoutePages }) => (
  <>
    {/* Scroll policy: top on new navigations, restore on back/forward,
        state-based section scrolling, hash stripping. Effects only — inert
        during prerender. */}
    <ScrollManager />
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<pages.Index />} />
        {/* Marketing section pages — each its own indexable URL (SEO). */}
        <Route path="/about" element={<pages.About />} />
        <Route path="/philosophy" element={<pages.Philosophy />} />
        <Route path="/services" element={<pages.Services />} />
        <Route path="/impact" element={<pages.Impact />} />
        <Route path="/faq" element={<pages.Faq />} />
        <Route path="/contact" element={<pages.Contact />} />
        {/* Blog */}
        <Route path="/blog" element={<pages.Blog />} />
        <Route path="/blog/:slug" element={<pages.BlogPost />} />
        {/* Legal pages */}
        <Route path="/impressum" element={<pages.Impressum />} />
        <Route path="/privacy" element={<pages.Privacy />} />
        {/* Locale-prefixed mirrors of the public routes, gated on
            PUBLISHED_LOCALES. A parent Route with no element groups the path
            prefix; its children render the same page components. */}
        {PREFIXED_LOCALES.map((locale) => (
          <Route key={locale} path={`/${locale}`}>
            <Route index element={<pages.Index />} />
            <Route path="about" element={<pages.About />} />
            <Route path="philosophy" element={<pages.Philosophy />} />
            <Route path="services" element={<pages.Services />} />
            <Route path="impact" element={<pages.Impact />} />
            <Route path="faq" element={<pages.Faq />} />
            <Route path="contact" element={<pages.Contact />} />
            <Route path="blog" element={<pages.Blog />} />
            <Route path="blog/:slug" element={<pages.BlogPost />} />
            <Route path="impressum" element={<pages.Impressum />} />
            <Route path="privacy" element={<pages.Privacy />} />
          </Route>
        ))}
        {/* Storyblok Visual Editor preview (dev-only; excluded from prerender).
            Splat captures the story full_slug: /preview/blog/<slug>,
            /preview/pages/<slug>, or bare /preview → home. */}
        <Route path="/preview/*" element={<PreviewSlug Comp={pages.StoryblokPage} />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<pages.NotFound />} />
      </Routes>
    </Suspense>
  </>
);

const App = () => (
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <AppProviders>
      <AppRoutes pages={clientPages} />
    </AppProviders>
  </BrowserRouter>
);

export default App;

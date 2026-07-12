import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import { I18nProvider } from "@lingui/react";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import { Impressum, Privacy } from "./pages/Legal";
import { StoryblokPage } from "./pages/StoryblokPage";
import { CookieNotice } from "./components/CookieNotice";
import { ScrollManager } from "./components/ScrollManager";
import { i18n } from "./i18n/i18n";
import { PUBLISHED_LOCALES, SOURCE_LOCALE } from "./i18n/locales";

const queryClient = new QueryClient();

// Wrapper component to extract slug from URL params
const StoryblokPageWrapper = () => {
  const { slug } = useParams<{ slug: string }>();
  return <StoryblokPage slug={slug || "home"} />;
};

// Shared providers/shell. Rendered identically on the server (prerender) and the
// client (hydration), so the markup matches and React can hydrate cleanly.
//
// <I18nProvider> supplies the shared Lingui instance (the global singleton from
// ./i18n/i18n) to <Trans>/useLingui() consumers. It renders a Fragment (no DOM
// node), so the markup is unaffected. The ACTIVE locale is not held here — it is
// activated on `i18n` before render/hydrate (server: prerender loop; client:
// main.tsx), derived from the URL prefix so both sides agree.
export const AppProviders = ({ children }: { children: React.ReactNode }) => (
  <I18nProvider i18n={i18n}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        {children}
        <CookieNotice />
      </TooltipProvider>
    </QueryClientProvider>
  </I18nProvider>
);

// The public routes, reused verbatim under each locale prefix. English keeps the
// existing ROOT routes (absolute paths) untouched; prefixed locales mount the
// same page components under /{locale}. The active locale is derived from the
// URL prefix, so a single set of page components serves every locale.
const PREFIXED_LOCALES = PUBLISHED_LOCALES.filter((l) => l !== SOURCE_LOCALE);

// Route table, router-agnostic so it can sit under BrowserRouter (client) or
// StaticRouter (server prerender).
export const AppRoutes = () => (
  <>
    {/* Scroll policy: top on new navigations, restore on back/forward,
        state-based section scrolling, hash stripping. Effects only — inert
        during prerender. */}
    <ScrollManager />
    <Routes>
    <Route path="/" element={<Index />} />
    {/* Blog — static imports: prerender needs these routes rendered eagerly */}
    <Route path="/blog" element={<Blog />} />
    <Route path="/blog/:slug" element={<BlogPost />} />
    {/* Legal pages */}
    <Route path="/impressum" element={<Impressum />} />
    <Route path="/privacy" element={<Privacy />} />
    {/* Locale-prefixed mirrors of the public routes, gated on PUBLISHED_LOCALES.
        Empty today (only "en" is published, and English stays at ROOT), so this
        adds NO routes and English behaviour is unchanged. Publishing a locale
        appends it to PUBLISHED_LOCALES and its /{locale}/... routes appear. A
        parent Route with no element groups the path prefix; its children render
        the same page components. */}
    {PREFIXED_LOCALES.map((locale) => (
      <Route key={locale} path={`/${locale}`}>
        <Route index element={<Index />} />
        <Route path="blog" element={<Blog />} />
        <Route path="blog/:slug" element={<BlogPost />} />
        <Route path="impressum" element={<Impressum />} />
        <Route path="privacy" element={<Privacy />} />
      </Route>
    ))}
    {/* Storyblok preview routes */}
    <Route path="/preview" element={<StoryblokPage slug="home" />} />
    <Route path="/preview/:slug" element={<StoryblokPageWrapper />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  </>
);

const App = () => (
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  </BrowserRouter>
);

export default App;

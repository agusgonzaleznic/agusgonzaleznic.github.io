import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import { Impressum, Privacy } from "./pages/Legal";
import { StoryblokPage } from "./pages/StoryblokPage";
import { CookieNotice } from "./components/CookieNotice";

const queryClient = new QueryClient();

// Wrapper component to extract slug from URL params
const StoryblokPageWrapper = () => {
  const { slug } = useParams<{ slug: string }>();
  return <StoryblokPage slug={slug || "home"} />;
};

// Shared providers/shell. Rendered identically on the server (prerender) and the
// client (hydration), so the markup matches and React can hydrate cleanly.
export const AppProviders = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      {children}
      <CookieNotice />
    </TooltipProvider>
  </QueryClientProvider>
);

// Route table, router-agnostic so it can sit under BrowserRouter (client) or
// StaticRouter (server prerender).
export const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Index />} />
    {/* Blog — static imports: prerender needs these routes rendered eagerly */}
    <Route path="/blog" element={<Blog />} />
    <Route path="/blog/:slug" element={<BlogPost />} />
    {/* Legal pages */}
    <Route path="/impressum" element={<Impressum />} />
    <Route path="/privacy" element={<Privacy />} />
    {/* Storyblok preview routes */}
    <Route path="/preview" element={<StoryblokPage slug="home" />} />
    <Route path="/preview/:slug" element={<StoryblokPageWrapper />} />
    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  </BrowserRouter>
);

export default App;

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { lingui } from "@lingui/vite-plugin";
import path from "path";
import mkcert from "vite-plugin-mkcert";

// https://vitejs.dev/config/
// CSP is set via CloudFront response headers policy (terraform/cdn.tf)
export default defineConfig(({ mode, isSsrBuild }) => {
  // Enable HTTPS only when VITE_HTTPS=true or in Storyblok mode
  const useHttps = process.env.VITE_HTTPS === 'true' || mode === 'storyblok';

  return {
  server: {
    host: "::",
    port: 8080,
    // Vite typed this as https.ServerOptions, not a boolean. An empty object is
    // what `true` collapsed to at runtime anyway (Vite spreads it), and it keeps
    // vite-plugin-mkcert past its `https === false` early-return so it can fill
    // in the key/cert it generates.
    https: useHttps ? {} : undefined,
  },
  plugins: [
    // Lingui macros (t / msg / <Trans> …) are rewritten at compile time by the
    // SWC plugin wired into the React transform below. The @lingui/vite-plugin
    // compiles `.po` catalog imports into message objects (one code-split chunk
    // per locale). Keep the SWC transform (Option A) so JSX output is unchanged.
    react({ plugins: [["@lingui/swc-plugin", {}]] }),
    lingui(),
    // Only use mkcert when HTTPS is enabled
    ...(useHttps ? [mkcert()] : []),
    // NO build-time precompression. CloudFront compresses on the fly
    // (`compress = true` on every cache behaviour), and GitHub Pages does not do
    // content negotiation against .gz/.br siblings at all — verified live: a
    // request to the Pages origin with `Accept-Encoding: br` returns no
    // content-encoding, while the same request through CloudFront returns
    // `content-encoding: br`. So the siblings were 2.30 MB across 240 files,
    // 31% of the deployed artifact, that nothing ever served.
    //
    // Removing them also deletes a real footgun: prerender.mjs had to
    // RE-compress every HTML file after head injection, because the client build
    // had already compressed the pre-injection shell. Miss that and negotiated
    // clients get a stale empty shell.
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Enable minification
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true, // Remove console logs in production
        drop_debugger: true,
        pure_funcs: ["console.log", "console.info"], // Remove specific console methods
        passes: 2, // Run compression twice for better results
      },
      mangle: {
        safari10: true, // Fix Safari 10 issues
      },
    },
    // Optimize chunk splitting (client build only — manual chunks don't apply
    // to the SSR build used for prerendering).
    rollupOptions: isSsrBuild
      ? {}
      : {
          output: {
            manualChunks: {
              // Split vendor chunks for better caching
              "react-vendor": ["react", "react-dom", "react-router-dom"],
              "storyblok": ["@storyblok/react"], // Separate Storyblok bundle
              "radix-ui": [
                "@radix-ui/react-accordion",
                "@radix-ui/react-dialog",
                "@radix-ui/react-dropdown-menu",
                "@radix-ui/react-label",
                "@radix-ui/react-popover",
                "@radix-ui/react-select",
                "@radix-ui/react-separator",
                "@radix-ui/react-slot",
                "@radix-ui/react-tabs",
              ],
            },
            // Add content hashing for better caching
            entryFileNames: "assets/[name]-[hash].js",
            chunkFileNames: "assets/[name]-[hash].js",
            assetFileNames: "assets/[name]-[hash].[ext]",
          },
        },
    // Optimize asset handling
    assetsInlineLimit: 4096, // Inline assets smaller than 4kb
    chunkSizeWarningLimit: 1000,
    // Enable CSS code splitting
    cssCodeSplit: true,
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router-dom",
      "lucide-react",
      "@storyblok/react", // Pre-bundle Storyblok for faster dev server startup
    ],
  },
};
});

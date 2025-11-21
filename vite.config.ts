import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import viteCompression from "vite-plugin-compression";
import mkcert from "vite-plugin-mkcert";

// Content Security Policy for production
// Strict CSP without unsafe-eval to prevent script injection attacks
// The production build doesn't use eval() or Function() constructors
// Includes Storyblok domains for CMS integration and Visual Editor
const cspContent = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://script.google.com https://script.googleusercontent.com https://app.storyblok.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: https: blob:;
  connect-src 'self' https://script.google.com https://script.googleusercontent.com https://api.storyblok.com https://api-us.storyblok.com;
  frame-src https://calendar.google.com https://calendar.app.google https://app.storyblok.com;
  form-action 'self';
  base-uri 'self';
  object-src 'none';
`.replace(/\s+/g, ' ').trim();

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Enable HTTPS only when VITE_HTTPS=true or in Storyblok mode
  const useHttps = process.env.VITE_HTTPS === 'true' || mode === 'storyblok';

  return {
  server: {
    host: "::",
    port: 8080,
    https: useHttps, // Enable HTTPS for Storyblok Visual Editor (set VITE_HTTPS=true)
  },
  plugins: [
    react(),
    // Only use mkcert when HTTPS is enabled
    ...(useHttps ? [mkcert()] : []),
    // Gzip compression
    viteCompression({
      algorithm: "gzip",
      ext: ".gz",
      threshold: 1024, // Only compress files larger than 1kb
    }),
    // Brotli compression (better than gzip)
    viteCompression({
      algorithm: "brotliCompress",
      ext: ".br",
      threshold: 1024,
    }),
    // CSP injection plugin (production only)
    {
      name: 'inject-csp',
      apply: 'build',
      transformIndexHtml(html) {
        // Inject CSP after viewport meta tag
        return html.replace(
          '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
          `<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <meta http-equiv="Content-Security-Policy" content="${cspContent}" />`
        );
      },
    },
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
    // Optimize chunk splitting
    rollupOptions: {
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
            "@radix-ui/react-toast",
            "@radix-ui/react-tooltip",
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

// Site-wide constants with NO module dependencies.
//
// SITE_URL used to live in src/lib/blog.ts, which eagerly `import.meta.glob`s
// every locale's blog JSON. Ten modules (SeoPage plus nine pages, most of them
// marketing pages with nothing to do with the blog) imported SITE_URL from
// there, so that glob became a dependency of the entry chunk and every page
// downloaded ~298 kB of blog data it never read. Keep this module
// dependency-free so it stays safe to import from anywhere.
export const SITE_URL = "https://agusgonzaleznic.com";

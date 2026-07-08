// Build-time guard: refuse to ship a Storyblok token in the client bundle.
//
// The blog is prerendered at build time (scripts/fetch-blog.mjs reads the
// NON-VITE_ STORYBLOK_PUBLIC_TOKEN). The browser never needs a Storyblok token.
// But the legacy /preview Visual Editor routes read import.meta.env
// .VITE_STORYBLOK_ACCESS_TOKEN, and Vite string-inlines ANY VITE_-prefixed var
// into the public JS. If such a var were ever set for a production build (e.g.
// added to deploy.yml build-env-vars to make preview work), a draft-reading
// token would be baked into world-readable dist/assets/*.js.
//
// This runs at the FRONT of `npm run build` (not `vite dev`), so local preview
// via the dev server still works, but a production build with any VITE_STORYBLOK_*
// var present fails loudly before the token can reach the bundle.

const leaking = Object.keys(process.env).filter((k) => k.startsWith("VITE_STORYBLOK_"));

if (leaking.length > 0) {
  console.error(
    "\n✖ assert-no-client-secrets: refusing to build.\n" +
      `  These VITE_STORYBLOK_* vars would be inlined into the public client bundle: ${leaking.join(", ")}.\n` +
      "  Storyblok is build-time only (STORYBLOK_PUBLIC_TOKEN, read by fetch-blog.mjs).\n" +
      "  Unset them for production builds; use `vite dev` for local Visual Editor preview.\n",
  );
  process.exit(1);
}

console.log("✓ assert-no-client-secrets: no VITE_STORYBLOK_* vars in build env");

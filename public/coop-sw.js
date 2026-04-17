// Service Worker for Cross-Origin-Opener-Policy header injection
// GitHub Pages does not support custom HTTP headers, so this SW
// intercepts navigation requests and adds the COOP header.
// Active from the second page load onward (after SW registration).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).then((response) => {
        const headers = new Headers(response.headers);
        headers.set("Cross-Origin-Opener-Policy", "same-origin");
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      })
    );
  }
});

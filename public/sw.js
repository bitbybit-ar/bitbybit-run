// Minimal pass-through service worker.
//
// Its only job today is to satisfy the browser's PWA installability criteria:
// Chrome on Android won't fire `beforeinstallprompt` (and won't offer the
// "Install app" UI) unless a service worker with a fetch handler is
// registered. This one caches nothing and intercepts nothing — every request
// goes straight to the network. Real offline support (precaching the shell and
// game assets) is a planned follow-up; see docs/PWA.md.
//
// Registered client-side, only on mobile, by
// components/layout/install-app/install-app.tsx.

self.addEventListener("install", () => {
  // Activate this version immediately instead of waiting for old tabs to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Take control of open clients as soon as we activate.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Intentionally empty: not calling event.respondWith() lets the request fall
  // through to the network untouched. The listener must exist for the browser
  // to treat the app as installable.
});

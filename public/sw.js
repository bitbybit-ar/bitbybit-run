// Service worker for Bit by Bit Run.
//
// Goals:
//   1. Make the app installable (a registered SW with a fetch handler is
//      required for Chromium's install prompt).
//   2. Let the single-player **practice** game run offline, while the
//      multiplayer lobby — which needs the Nostr relays and the API — stays
//      online-only and fails loudly when there's no connection.
//
// Strategy (hand-rolled, no build-time precache manifest so it's independent of
// the bundler):
//   - Static assets (`/_next/static`, `/sprites`, icons, fonts) →
//     stale-while-revalidate. Safe because Next fingerprints the filenames.
//   - Page navigations → network-first, falling back to the last-seen copy and
//     finally the precached offline page.
//   - `/api/*` and cross-origin requests → never intercepted (always network).
//
// Spanish is served prefix-free (defaultLocale "es", localePrefix "as-needed"),
// English under `/en` — hence the dual precache URLs and the locale-aware
// offline fallback.
//
// Registered for every visitor by
// components/layout/service-worker-registrar/service-worker-registrar.tsx.

const VERSION = "v2";
const STATIC_CACHE = `bbb-static-${VERSION}`;
const PAGES_CACHE = `bbb-pages-${VERSION}`;

// The offline fallback and the practice game for both locales, plus the
// manifest and app icons. The hashed JS/CSS chunks these pages need are cached
// lazily on the first online visit (see the static-asset handler), so a brand
// new install that goes offline before ever loading the game won't have them
// yet — the offline page still renders and explains the situation.
const PRECACHE_URLS = [
  "/offline",
  "/en/offline",
  "/demo",
  "/en/demo",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGES_CACHE);
      // Best-effort: one unreachable URL must not abort the whole precache.
      await Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from previous versions of this SW.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("bbb-") && !key.endsWith(VERSION))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/sprites/") ||
    /\.(?:js|css|woff2?|png|jpe?g|svg|webp|gif|ico)$/.test(url.pathname)
  );
}

function offlineFallbackFor(pathname) {
  return pathname.startsWith("/en") ? "/en/offline" : "/offline";
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GET is cacheable; auth/result POSTs always go to the network.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Same-origin only. Cross-origin avatars / LNURL hosts pass through, and the
  // Nostr relays use wss:// which never surfaces as a fetch event anyway.
  if (url.origin !== self.location.origin) return;

  // Never cache the API: auth and multiplayer must hit the network so they
  // fail loudly offline instead of serving a stale response.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request, url));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

// Network-first for pages: fresh HTML when online, the last-seen copy when not,
// and the precached offline page as a final fallback.
async function handleNavigation(request, url) {
  const cache = await caches.open(PAGES_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const fallback = await cache.match(offlineFallbackFor(url.pathname));
    return fallback || Response.error();
  }
}

// Stale-while-revalidate for static assets: serve instantly from cache, refresh
// in the background.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

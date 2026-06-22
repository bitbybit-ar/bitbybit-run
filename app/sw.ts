import { defaultCache } from "@serwist/turbopack/worker";
import {
  type PrecacheEntry,
  type SerwistGlobalConfig,
  NetworkOnly,
  Serwist,
} from "serwist";

// `self.__SW_MANIFEST` is replaced at build time with the precache manifest
// (every hashed static asset) plus the `additionalPrecacheEntries` declared in
// app/serwist/[path]/route.ts. This is the upgrade over the old hand-rolled SW:
// the practice game's assets are precached with proper revisioning instead of
// cached lazily on first visit.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Auth and multiplayer must always hit the network and fail loudly offline
    // — never serve a stale session or match response. The Nostr relays use
    // wss:// and never surface as fetch events, so they're untouched either way.
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  // When a document navigation can't be served (offline, uncached route), fall
  // back to the localized offline page. Spanish is served prefix-free, English
  // under /en, so the /en entry is checked first.
  fallbacks: {
    entries: [
      {
        url: "/en/offline",
        matcher({ request }) {
          return (
            request.destination === "document" &&
            new URL(request.url).pathname.startsWith("/en")
          );
        },
      },
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

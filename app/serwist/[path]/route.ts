import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

// Serves the compiled service worker at `/serwist/sw.js` (built from app/sw.ts
// via esbuild) together with the precache manifest.
//
// One revision per deploy is enough to bust these dynamic pages: we tag them
// with the current commit so a new build invalidates the precached HTML.
const revision =
  spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf-8",
  }).stdout.trim() ||
  // Fall back to a build-time constant when git isn't available (e.g. a shallow
  // CI checkout) so the precache still has a stable revision.
  process.env.VERCEL_GIT_COMMIT_SHA ||
  "dev";

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    // Precache the offline fallback and the single-player practice game for both
    // locales (es prefix-free, en under /en) so practice works offline from the
    // first load — not just after visiting it online once.
    additionalPrecacheEntries: [
      { url: "/offline", revision },
      { url: "/en/offline", revision },
      { url: "/demo", revision },
      { url: "/en/demo", revision },
    ],
    swSrc: "app/sw.ts",
    useNativeEsbuild: true,
  });

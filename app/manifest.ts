import type { MetadataRoute } from "next";

/**
 * Web App Manifest — served at `/manifest.webmanifest` and auto-linked by Next
 * into every page's <head>. Makes the site installable as a PWA (home-screen
 * app, standalone window). Icons are generated on the fly from the brand mark
 * (see the `app/icon-*.png` routes), so there are no static image assets.
 *
 * `start_url: "/"` lets the next-intl middleware redirect the installed app to
 * the user's locale. The Serwist service worker (`app/sw.ts`) precaches the
 * practice game so single-player works offline; the multiplayer lobby stays
 * online-only (see `docs/PWA.md`).
 *
 * Shortcut/label strings are intentionally English: the manifest is a single
 * static document with no locale, so we keep one canonical language (`lang`)
 * rather than guessing the user's.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // Stable identity so the browser treats updates as the same installed app
    // even if start_url ever changes.
    id: "/",
    name: "BitByBit RUN",
    short_name: "BitByBit",
    description:
      "A free, lightweight, web-based multiplayer runner race. Grab the good food to sprint, dodge the junk, and be first to the finish line.",
    lang: "en",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#17132b",
    theme_color: "#17132b",
    categories: ["games", "entertainment"],
    // Long-press / right-click the installed icon to jump straight in. Practice
    // is listed because it's the one mode that works offline.
    shortcuts: [
      {
        name: "Play multiplayer",
        short_name: "Play",
        url: "/play",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Practice (offline)",
        short_name: "Practice",
        url: "/demo",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Leaderboard",
        short_name: "Ranking",
        url: "/leaderboard",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

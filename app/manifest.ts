import type { MetadataRoute } from "next";

/**
 * Web App Manifest — served at `/manifest.webmanifest` and auto-linked by Next
 * into every page's <head>. Makes the site installable as a PWA (home-screen
 * app, standalone window). Icons are generated on the fly from the brand mark
 * (see the `app/icon-*.png` routes), so there are no static image assets.
 *
 * `start_url: "/"` lets the next-intl middleware redirect the installed app to
 * the user's locale. Today the registered service worker (`public/sw.js`) is a
 * bare pass-through that only satisfies installability — offline caching is a
 * planned follow-up (see `docs/PWA.md`).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bit by Bit Run",
    short_name: "Bit by Bit",
    description:
      "A free, lightweight, web-based multiplayer runner race. Grab the good food to sprint, dodge the junk, and be first to the finish line.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#17132b",
    theme_color: "#17132b",
    categories: ["games", "entertainment"],
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

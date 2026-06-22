import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSerwist } from "@serwist/turbopack";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/**
 * Security headers applied to every response. We deliberately keep the CSP to
 * framing/plugin/base directives only — these add real protection (clickjacking,
 * plugin injection, <base> hijacking) without restricting resource loading, so
 * they can't break the app's many origins (Nostr relays over `wss:`, arbitrary
 * avatar/LNURL hosts over `https:`, next/font, Phaser).
 */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  // Let SCSS partials resolve `@use "@/styles/..."` from the project root.
  sassOptions: {
    includePaths: [process.cwd()],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// Serwist (Turbopack-native) compiles the service worker served from
// `/serwist/sw.js` (see app/serwist/[path]/route.ts) and injects the precache
// manifest. Wrapped outermost so it composes with the next-intl plugin.
export default withSerwist(withNextIntl(nextConfig));

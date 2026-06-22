# 📱 Progressive Web App (PWA)

**Bit by Bit Run** is installable as a Progressive Web App. On a phone, players
can add it to their home screen and launch it like a native app — full screen,
its own icon, no browser chrome.

This document explains what's wired up, how the install prompt behaves, and
what's intentionally left for a future iteration.

## What's included

| Piece                        | File                                                       | Purpose                                                                            |
| ---------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Web App Manifest             | `app/manifest.ts`                                          | Served at `/manifest.webmanifest`; name, colors, icons, `display: standalone`.     |
| App icons (any + maskable)   | `app/icon-192.png/`, `icon-512.png/`, `icon-maskable.png/` | Generated from the brand mark — no static PNG assets.                              |
| Service worker               | `public/sw.js`                                             | Minimal pass-through; exists only to satisfy installability (no caching yet).      |
| Install prompt (mobile-only) | `components/layout/install-app/install-app.tsx`            | The "Install app" bar. Renders nothing on desktop or once installed.               |
| Theme color / Apple meta     | `app/[locale]/layout.tsx`                                  | `viewport.themeColor` (light/dark) + `appleWebApp` so iOS treats it as standalone. |

The manifest `<link>` and the favicon/apple-touch-icon links are injected
automatically by Next from the `app/manifest.ts`, `app/icon.tsx`, and
`app/apple-icon.tsx` file conventions — there's no manual `<head>` wiring.

## The install prompt

The install bar is **mobile-only by design**. Every decision is made
client-side after mount, so on the server and on desktop the component renders
nothing at all — the desktop experience is byte-for-byte unchanged.

It appears only when **all** of these hold:

- the viewport is mobile (`max-width: 767px`),
- the app isn't already installed (`display-mode: standalone`),
- the user hasn't dismissed it (remembered in `localStorage`), and
- the browser offered an install prompt **or** we're on iOS.

### Platform differences

- **Android / Chromium** — the browser fires `beforeinstallprompt`. We capture
  it, prevent the default mini-infobar, and trigger the native install dialog
  from our own button. Chromium only fires this event when a service worker
  with a `fetch` handler is registered, which is the sole reason `public/sw.js`
  exists today.
- **iOS / Safari** — Apple does **not** implement `beforeinstallprompt`. There
  is no programmatic install. The button instead reveals a short hint:
  _Share → Add to Home Screen_. The `appleWebApp` metadata makes the launched
  app run standalone.

### Why desktop sees nothing

Desktop Chromium would also fire `beforeinstallprompt`, but the component gates
rendering on a mobile viewport, so the bar never shows on desktop. The service
worker is likewise registered **only on mobile**, so desktop gets no service
worker and its behavior is untouched.

## Icons

All icons are generated at request time from the three-block brand mark (the
same mark as `components/common/logo-blocks`), via `lib/pwa/brand-icon.tsx`.
Keeping them code-generated matches the project's "no image assets" approach and
keeps them in sync with the palette in `styles/_theme.scss`.

Because Next serves the root metadata routes `/icon` and `/apple-icon` **without
a file extension**, the next-intl middleware matcher in `proxy.ts` excludes them
explicitly (`icon$|apple-icon$`) — otherwise `/icon` gets rewritten to
`/es/icon` and 404s, and the favicon never loads. The PWA icons (`*.png`) and
`manifest.webmanifest` already contain a dot, so the existing `.*\..*` rule
covers them.

## Not included yet (future work)

The current service worker caches nothing. The app still needs the network to
run, and the multiplayer lobby / Nostr auth are online-only by nature. A
follow-up could add real offline support:

- Precache the app shell and the Phaser game assets (`public/sprites`) so
  single-player works offline and loads instantly.
- Use a network-first strategy for live match data and never cache auth
  endpoints.
- The recommended tool is **Serwist** (the maintained successor to `next-pwa`).

## Testing the install flow locally

1. `npm run dev` and open the site on a phone on the same network (or Chrome
   DevTools → device toolbar with a mobile viewport).
2. Android Chrome: the install bar appears; tapping **Install app** opens the
   native dialog. You can also use DevTools → _Application → Manifest → Install_.
3. iOS Safari: the bar appears with the **Install app** button revealing the
   _Share → Add to Home Screen_ hint.
4. Verify the served files: `/manifest.webmanifest`, `/icon-192.png`,
   `/icon-512.png`, `/icon-maskable.png`, `/icon`, `/apple-icon` should all
   return `200` with the right content type.

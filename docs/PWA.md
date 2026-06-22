# 📱 Progressive Web App (PWA)

**Bit by Bit Run** is an installable Progressive Web App. On a phone, players can
add it to their home screen and launch it full screen like a native app — and
the single-player **practice** game keeps working with no connection.

This document covers the install prompt, the icons, and the offline behavior
(what works offline, what doesn't, and why).

## What's included

| Piece                        | File                                                                      | Purpose                                                                            |
| ---------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Web App Manifest             | `app/manifest.ts`                                                         | `/manifest.webmanifest`: name, colors, icons, `display: standalone`, shortcuts.    |
| App icons (any + maskable)   | `app/icon-192.png/`, `icon-512.png/`, `icon-maskable.png/`                | Generated from the brand mark — no static PNG assets.                              |
| Service worker               | `public/sw.js`                                                            | Caching SW: precache + offline strategy (see below).                               |
| SW registration              | `components/layout/service-worker-registrar/service-worker-registrar.tsx` | Registers the SW for every visitor after `load`.                                   |
| Install prompt (mobile-only) | `components/layout/install-app/install-app.tsx`                           | The "Install app" bar. Renders nothing on desktop or once installed.               |
| Offline banner               | `components/layout/offline-banner/offline-banner.tsx`                     | Tells the player practice works offline but multiplayer needs a connection.        |
| Online-status hook           | `lib/hooks/useOnlineStatus.ts`                                            | `navigator.onLine` + online/offline events, SSR-safe.                              |
| Offline fallback page        | `app/[locale]/offline/page.tsx`                                           | Precached page the SW serves when a navigation can't reach the network.            |
| Theme color / Apple meta     | `app/[locale]/layout.tsx`                                                 | `viewport.themeColor` (light/dark) + `appleWebApp` so iOS treats it as standalone. |

The manifest `<link>` and the favicon/apple-touch-icon links are injected
automatically by Next from the `app/manifest.ts`, `app/icon.tsx`, and
`app/apple-icon.tsx` file conventions — there's no manual `<head>` wiring.

## The install prompt

The install bar is **mobile-only by design**. Every decision is made
client-side after mount, so on the server and on desktop the component renders
nothing at all — the desktop install experience is byte-for-byte unchanged.

It appears only when **all** of these hold:

- the viewport is mobile (`max-width: 767px`),
- the app isn't already installed (`display-mode: standalone`),
- the user hasn't dismissed it (remembered in `localStorage`), and
- the browser offered an install prompt **or** we're on iOS.

On mobile it stacks above the fake-ads sticky banner instead of overlapping it:
the banner publishes a `--app-bottom-inset` CSS variable (see
`fake-ads.module.scss`) that the install bar reads to offset its `bottom`.

### Platform differences

- **Android / Chromium** — the browser fires `beforeinstallprompt`. We capture
  it, prevent the default mini-infobar, and trigger the native install dialog
  from our own button. Chromium only fires this event when a service worker with
  a `fetch` handler is registered.
- **iOS / Safari** — Apple does **not** implement `beforeinstallprompt`. There is
  no programmatic install. The button instead reveals a short hint: _Share → Add
  to Home Screen_. The `appleWebApp` metadata makes the launched app standalone.

The **service worker is registered for everyone** (it powers offline caching),
but the install **button** stays mobile-only, so desktop sees no install UI.

## Offline support

The goal is simple: **practice works offline, multiplayer doesn't** — and the
player is told which is which.

### Service worker strategy (`public/sw.js`)

Hand-rolled (no build-time precache manifest, so it's independent of the
bundler). On a same-origin `GET`:

- **Static assets** (`/_next/static`, `/sprites`, icons, fonts) →
  _stale-while-revalidate_. Safe because Next fingerprints the filenames.
- **Page navigations** → _network-first_: fresh HTML when online, the last-seen
  copy when not, and finally the precached offline page.
- **`/api/*` and cross-origin** → never intercepted. Auth and the Nostr relays
  (which use `wss://` and never surface as fetch events) always hit the network,
  so multiplayer fails loudly offline instead of serving something stale.

On install it precaches the offline page and the practice game for both locales
(Spanish is prefix-free, English under `/en`), plus the manifest and icons:

```
/offline   /en/offline   /demo   /en/demo
/manifest.webmanifest   /icon-192.png   /icon-512.png   /icon-maskable.png
```

The hashed JS/CSS chunks those pages need are cached lazily on the first online
visit (stale-while-revalidate), so the practice game is fully offline-capable
once it has been opened at least once online. A brand-new install that goes
offline before ever loading the game still gets the offline page, which explains
the situation and links to practice.

### How the player is told

- A sticky **offline banner** under the navbar (driven by `useOnlineStatus`)
  appears whenever the browser reports it's offline: _"You're offline — practice
  still works, multiplayer needs a connection."_
- In the races browser (`MatchBrowser`), **Create race** is disabled offline and
  the open-races list is replaced with a "you're offline" note. **Practice**
  stays enabled.
- Navigating to an uncached, network-only route offline lands on the **offline
  page**, which links straight to the practice game.

### What still needs the network

Multiplayer end-to-end: hosting/joining, the live race over relays, leaderboard
persistence to Neon, Nostr login, and Lightning zaps. These are online-only by
nature and are intentionally never cached.

## Icons

All icons are generated at request time from the three-block brand mark (the same
mark as `components/common/logo-blocks`), via `lib/pwa/brand-icon.tsx`. Keeping
them code-generated matches the project's "no image assets" approach and keeps
them in sync with the palette in `styles/_theme.scss`.

Because Next serves the root metadata routes `/icon` and `/apple-icon` **without
a file extension**, the next-intl middleware matcher in `proxy.ts` excludes them
explicitly (`icon$|apple-icon$`) — otherwise `/icon` gets rewritten to `/es/icon`
and 404s, and the favicon never loads. The PWA icons (`*.png`) and
`manifest.webmanifest` already contain a dot, so the existing `.*\..*` rule
covers them.

## Future work

- **Precache manifest with revisioning** (e.g. **Serwist**) so the game is
  offline-capable on the very first load, before any online visit warms the
  cache. The current hand-rolled SW deliberately trades that for zero bundler
  coupling and full control over the caching policy.
- **Cache App Router RSC navigations** so client-side (soft) navigations to the
  practice game also work offline, not just full page loads.
- **iOS splash screens** (`apple-touch-startup-image`) to avoid the white flash
  when launching the installed app.

## Testing locally

### Install flow

1. `npm run dev` and open the site on a phone on the same network (or Chrome
   DevTools → device toolbar with a mobile viewport).
2. Android Chrome: the install bar appears; tapping **Install app** opens the
   native dialog (or DevTools → _Application → Manifest → Install_).
3. iOS Safari: the bar's **Install app** button reveals the _Share → Add to Home
   Screen_ hint.

### Offline (needs a production build — the SW isn't active in dev)

1. `npm run build && npm run start`.
2. Load the site, open **practice** (`/demo`) once so it's cached.
3. DevTools → _Network → Offline_ (or stop the server), then reload `/demo` — it
   still plays, and the offline banner appears.
4. Navigate to a network-only route (e.g. `/leaderboard`) while offline — you
   land on the offline page.

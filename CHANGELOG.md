# 📝 Changelog

All notable changes to **BitByBit RUN** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Design and gameplay details live in [`docs/`](docs/README.md). This file is the
> release-facing log — each tagged release maps to a version section below.

## [Unreleased]

Everything below ships in the upcoming **1.0.0** — the full game, serverless
multiplayer, leaderboard, Nostr identity with Lightning zaps, and the fake-ads
scam museum. At release time this heading becomes `## [1.0.0] — <date>` and the
compare links at the bottom are pointed at the `v1.0.0` tag.

### Added

#### Gameplay

- **2.5D runner race** down a perspective athletics track, drawn entirely from
  shapes + emoji (no image assets) for a fast, lightweight load.
- **Energy / poison food loop:** grab good food (⚡) to sprint, dodge junk (🍔)
  or fill the poison bar and get knocked back a chunk of track (bathroom break).
  **Rocket boosters** (🚀) give a timed speed burst.
- **Four animated characters** (Sprinter, Barbie, T-Rex, Bitcoin), each on its
  own lane with a full run-cycle sprite.
- **Keyboard and touch controls** — arrows/WASD on desktop, and on mobile an
  **on-screen gamepad** drawn in-canvas: ◀ ▶ lane buttons under the left thumb
  and a held ⚡ accelerate button under the right, so you can **steer and
  accelerate at once** (multitouch). The pad shows only on touch devices and in
  every mode (demo, practice, multiplayer); the canvas is tuned so taps never
  trigger page scroll or zoom.
- **Per-match seeded tracks:** obstacle/food layout is derived from the match id,
  so every player in a race shares the exact same course.
- **Crowd signs:** funny, localized slogans line the track like roadside
  billboards. The track is a fixed-width anchor and the side margins flex, so on
  wide screens the signs sit beside it; on narrow **portrait** phones (no
  roadside room) each sign instead hangs from an **overhead gantry arch** the
  runner drives under — one at a time, kept in a readable size band.
- **Free demo** (no login) and a **solo practice** mode for warming up.
- **Sound effects** synthesized at runtime via the Web Audio API (no audio
  assets) for every cue — start, eating, lane changes, bathroom break, finish —
  with a persisted 🔊/🔇 mute toggle. Eating a **rocket booster** (🚀) plays a
  short music clip (the one sampled sound). See `docs/GAME-DESIGN.md` → "Audio".
- Light/dark theme and a responsive layout from phone to desktop.

#### Multiplayer (serverless, over Nostr)

- **Lobby flow:** create a race (with an optional race name), share an invite
  link, or join an open race from the browser; pick your runner/lane; the host
  starts (or it auto-starts when full).
- **Realtime racing** at ~5 Hz straight over public Nostr relays — no game
  server — with rivals shown as their **actual animated characters** plus a
  minimap.
- **Per-match session key** signs the high-frequency frames locally, so
  Amber/NIP-46 users get zero prompts mid-race.
- **Reconnect & resume:** a player can re-open the link and rejoin in progress
  (their position resumes from saved progress) without restarting the match.
- **Anti-cheat plausibility checks:** speed, timestamps, finishing position, and
  per-race score are all bounded at the wire boundary, and frames are bound to
  the signer's announced session key.
- **Graceful endings:** everyone runs their own line; finishers wait on an
  **engaging spectator screen** — a live countdown to the result, real-time
  progress bars of the rivals still racing, confetti for the leader, and rotating
  cheers. A runner still on the track gets a countdown banner once a rival
  crosses. Leaving a match is confirmed first and announced to the others.

#### Leaderboard

- **Global ranking** by total wins, then by each player's **personal best**
  (their highest-scoring single race).
- **Sortable columns** — Wins / Best / Races toggle the ranking — with
  pagination, podium styling, and the same table shared by the end-of-match
  results screen.
- Standings persist to **Neon Postgres** when a match finishes — with retry on a
  transient network/5xx blip, so a race you played isn't dropped from the
  ranking by a single failed request.

#### Fake ads (Bitcoin literacy, played for laughs) 🎣

- **A built-in scam museum:** ~18 deliberately fake crypto-spam banners line the
  desktop margins (sticky bottom banner on mobile), reproducing real-world bait
  — "You won 1 BTC!", "Send 1 BTC get 2 back", "Elon giveaway", "50% APY",
  "browser miner" — so players practice _not_ clicking it.
- **Fake "watch an ad to keep playing" interstitial** with a bogus "Skip in 5…"
  countdown that gates the close button — a knowing parody of the mobile-game
  dark pattern.
- **Every click lands on a "Gotcha" page** with a scam-specific punchline and a
  friendly "This was a fake ad. No sats were harmed." disclaimer (`noindex`).
- **Spam respawns when dismissed** (per-session), and clearing the whole pool
  earns a cheeky "You cleared the spam 🧹" reward. Full write-up in
  [docs/GAME-DESIGN.md §10](docs/GAME-DESIGN.md).

#### Identity, auth & Lightning

- **Nostr login** via browser extension (NIP-07), pasted nsec, or NIP-46 bunker,
  using **NIP-98** signed HTTP auth with single-use replay protection.
- **Rolling 7-day session:** the JWT cookie is re-minted on every navigation, so
  an active player never gets logged out — a long match (even waiting in the
  lobby for opponents) can't outlive the session.
- **Signer survives reloads:** extension and NIP-46 (Amber, nsec.app…) signers
  re-attach silently after a reload, so a logged-in user isn't left "logged in
  but unable to sign." The NIP-46 bunker connection is rebuilt from a persisted
  pointer (connection metadata, never the private key).
- **Profile sync** pulls display name, avatar, and Lightning address from the
  user's Nostr kind:0 metadata.
- **⚡ Zap the winner:** tip over Lightning with WebLN, or — with no wallet — a
  **BOLT11 QR + copyable invoice + `lightning:` deep link**, with the amount
  confirmed before payment.

#### Platform

- **English / Spanish** throughout (next-intl), with locale-aware routing.
- **SEO + social previews:** favicon, per-locale Open Graph / Twitter images.
- **Installable PWA:** web app manifest (with launcher shortcuts),
  code-generated app icons (any + maskable), theme-color, and a **mobile-only
  "Install app" prompt** (native install on Android, _Add to Home Screen_ hint
  on iOS) that stays invisible on desktop.
- **Offline practice:** a **Serwist** service worker precaches the single-player
  game (revisioned, at install) so **practice works with no connection from the
  first load**, while multiplayer stays online-only (`/api` is never cached) —
  the races browser disables hosting/joining offline and a banner tells the
  player practice still works. Network-only routes fall back to a localized
  offline page. See [docs/PWA.md](docs/PWA.md).
- **Security:** rate limiting on sensitive API routes and framing/MIME/referrer
  response headers.
- **Automated tests + CI:** Vitest unit suite (Nostr auth, schemas, multiplayer
  state, game logic, leaderboard) plus a Neon-backed integration test, run on
  every push/PR alongside lint and typecheck — see
  [docs/TESTING.md](docs/TESTING.md).
- **$0 infrastructure** — Vercel + free public relays + Neon free tier +
  peer-to-peer Lightning.

### Fixed

#### Responsive / mobile

- **Navbar no longer overflows on phones:** added a compact `xs` button size
  (tighter padding, lighter offset shadow), shrank the locale/theme toggle and
  the brand wordmark on mobile, and tightened the action-cluster gap so the
  whole bar fits a ~360px screen.
- **Icon-only login on mobile:** the "Entrar" / "Login" navbar button collapses
  to a 👤 icon on phones (full label kept as its accessible name), mirroring the
  🏆 leaderboard button.
- **Install prompt copy fits in one line:** replaced the truncated
  title + subtitle with a single wrapping line ("Agregá BitByBit RUN a tu
  pantalla de inicio" / "Add BitByBit RUN to your home screen") and a compact
  CTA, so the text is no longer cut off.
- **Square brand blocks:** the favicon and generated app icons now draw three
  squares instead of three half-height rectangles.
- **Food messages no longer overflow or hide behind signs on phones:** in
  portrait the in-canvas food toast drops below the overhead crowd signs and
  wraps long lines onto a second line, so both stay fully readable (desktop is
  unchanged).

#### Gameplay

- **Food is no longer clipped from an adjacent lane mid-merge:** food now
  resolves strictly against the runner's nearest lane, so sliding toward a
  booster can't accidentally eat the junk in the lane you're leaving — booster
  gauntlets stay dodgeable as designed.
- **Touch restart hint no longer mentions a missing key:** the solo finish
  overlay said "press R to race again" even on mobile, where there's no R key.
  It now reads "tap to race again" on touch devices (restart is a screen tap);
  desktop keeps the R hint. The how-to-play touch column and `GAME-DESIGN`
  document the tap-to-restart gesture.

#### Internals

- **Per-match track length** is read from the active track instead of the
  shared default, removing a latent mismatch if a future seed changes length.
- **Lobby host/track** are read from the host's own presence rather than
  whichever seat happened to arrive first.

#### Tooling & docs

- **Repo is Prettier-clean** and CI now runs `format:check` (added a
  `.prettierignore` for build output and generated migration metadata), so
  formatting drift can't land again.
- **Integration tests run locally and in CI:** `test:integration` auto-loads
  `.env.test` (via `--env-file-if-exists`), and a new
  `tests/integration/nonce-store.test.ts` covers the durable `auth_nonces`
  replay guard against a real Neon test branch.
- **Docs corrected to match the implementation:** rolling 7-day session (not a
  60-minute timeout), auth methods are NIP-07 / NIP-46 / nsec (not `nostr-login`),
  `.env.local` setup, the scoring table (booster bonus added, the unimplemented
  sprint/overtake row removed), the ±10s NIP-98 window, and the junk-food copy
  (bounded bathroom setback, not "back to the start").

### Security

- **Host-only race start:** the `control` (start) event is now verified against
  the match host (signed by the host's identity), so a rogue peer subscribed to
  the channel can no longer force-start the race for everyone.
- **Durable NIP-98 replay protection:** single-use login nonces moved from
  in-process memory to a Postgres `auth_nonces` table, so a captured
  `Authorization` header can't be replayed by landing on a different Vercel
  serverless instance.

<!--
  At release time, replace the line below with:
  [1.0.0]: https://github.com/bitbybit-ar/bitbybit-run/releases/tag/v1.0.0
  and add an [Unreleased] compare link once a newer tag exists.
-->

[Unreleased]: https://github.com/bitbybit-ar/bitbybit-run/commits/main

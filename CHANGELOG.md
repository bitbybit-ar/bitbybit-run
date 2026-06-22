# 📝 Changelog

All notable changes to **Bit by Bit Run** are documented here.

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
  or fill the poison bar and get sent back. **Rocket boosters** (🚀) give a
  timed speed burst.
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
- **Free demo** (no login) and a **solo practice** mode for warming up.
- Sound effects, light/dark theme, and a responsive layout from phone to desktop.

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
- **Installable PWA:** web app manifest, code-generated app icons (any +
  maskable), theme-color, and a **mobile-only "Install app" prompt** (native
  install on Android, _Add to Home Screen_ hint on iOS) that stays invisible on
  desktop. See [docs/PWA.md](docs/PWA.md).
- **Security:** rate limiting on sensitive API routes and framing/MIME/referrer
  response headers.
- **Automated tests + CI:** Vitest unit suite (Nostr auth, schemas, multiplayer
  state, game logic, leaderboard) plus a Neon-backed integration test, run on
  every push/PR alongside lint and typecheck — see
  [docs/TESTING.md](docs/TESTING.md).
- **$0 infrastructure** — Vercel + free public relays + Neon free tier +
  peer-to-peer Lightning.

<!--
  At release time, replace the line below with:
  [1.0.0]: https://github.com/bitbybit-ar/bitbybit-run/releases/tag/v1.0.0
  and add an [Unreleased] compare link once a newer tag exists.
-->

[Unreleased]: https://github.com/bitbybit-ar/bitbybit-run/commits/main

# 📝 Release Notes — Bit by Bit Run

The features that make up **Bit by Bit Run**, grouped by area.

## Gameplay

- **2.5D runner race** down a perspective athletics track, drawn entirely from
  shapes + emoji (no image assets) for a fast, lightweight load.
- **Energy / poison food loop:** grab good food (⚡) to sprint, dodge junk (🍔)
  or fill the poison bar and get sent back. **Rocket boosters** (🚀) give a
  timed speed burst.
- **Four animated characters** (Sprinter, Barbie, T-Rex, Bitcoin), each on its
  own lane with a full run-cycle sprite.
- **Keyboard and touch controls** — arrows/WASD on desktop, tap-the-sides /
  hold-to-sprint on mobile, with the canvas tuned so taps never trigger page
  scroll or zoom.
- **Per-match seeded tracks:** obstacle/food layout is derived from the match id,
  so every player in a race shares the exact same course.
- **Free demo** (no login) and a **solo practice** mode for warming up.
- Sound effects, light/dark theme, and a responsive layout from phone to desktop.

## Multiplayer (serverless, over Nostr)

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

## Leaderboard

- **Global ranking** by total wins, then by each player's **personal best**
  (their highest-scoring single race).
- **Sortable columns** — Wins / Best / Races toggle the ranking — with
  pagination, podium styling, and the same table shared by the end-of-match
  results screen.
- Standings persist to **Neon Postgres** when a match finishes.

## Identity, auth & Lightning

- **Nostr login** via browser extension (NIP-07), pasted nsec, or NIP-46 bunker,
  using **NIP-98** signed HTTP auth with single-use replay protection.
- **Profile sync** pulls display name, avatar, and Lightning address from the
  user's Nostr kind:0 metadata.
- **⚡ Zap the winner:** tip over Lightning with WebLN, or — with no wallet — a
  **BOLT11 QR + copyable invoice + `lightning:` deep link**, with the amount
  confirmed before payment.

## Platform

- **English / Spanish** throughout (next-intl), with locale-aware routing.
- **SEO + social previews:** favicon, per-locale Open Graph / Twitter images.
- **Security:** rate limiting on sensitive API routes and framing/MIME/referrer
  response headers.
- **$0 infrastructure** — Vercel + free public relays + Neon free tier +
  peer-to-peer Lightning.

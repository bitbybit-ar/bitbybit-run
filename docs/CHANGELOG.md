# 📝 Changelog

All notable changes to **Bit by Bit Run** (project & documentation) are recorded
here. Format loosely based on [Keep a Changelog](https://keepachangelog.com/).
Dates use `YYYY-MM-DD`.

## [Unreleased]

### Fixed (multiplayer playtest)

- **Amber no longer prompts per frame.** Each client now mints a throwaway
  **session keypair** per match; the real identity signs the presence event once
  (announcing + binding that key) and all ~5 Hz runner/finish frames are signed
  locally — so a NIP-46/Amber user gets no prompts during the race and their live
  position actually propagates. Frames still carry the real pubkey; a frame whose
  signer doesn't match the announced session key is rejected (anti-spoof).
- **Rivals render as their real animated character** (by lane) with a name label,
  instead of a moving colored dot. All character sheets load in a match; a
  missing sheet falls back to the old ghost. Minimap keeps lane-colored dots.
- **A race ends when the first runner crosses** — every client jumps to the
  results screen at once (no waiting for stragglers). The crosser wins; the rest
  rank by total points, and **finishing position adds a points bonus**
  (`POINTS.placement`).
- **No joining or restarting a started match.** A match's lifecycle is now carried
  in retained presence, so a client that (re)joins learns it already started.
  Latecomers who weren't on the roster see "race already started"; `start()` is a
  no-op past `waiting`, killing the "leave → re-open link → restart" exploit. A
  rostered player can reconnect and resume (progress saved in `sessionStorage`),
  or see the results if it finished — without restarting it for anyone.
- **Invite link lands in the runner lobby.** A logged-out invitee's `?m=&h=` is
  now preserved through sign-in (in `next`), so after login they return to the
  match lobby instead of the generic races browser.
- **Global leaderboard is paginated** (10/player per page) with locale-aware
  prev/next links; rank badges show true global rank and keep podium colors on
  the real top three.

### Changed

- **Per-match track layout.** Obstacle/food positions are now seeded from the
  `matchId` (`buildTrack(seed)` + `lib/game/rng.ts`), so every player in a match
  shares the exact same track while different matches differ. Single-player/demo
  use the fixed `"classic-v1"` seed. Booster gauntlets stay dodgeable on every
  seed (🚀 lane + a guaranteed junk-free escape lane).

### Added

- **Multiplayer realtime hardening (Nostr).** Optimizations to the serverless
  realtime layer (see [ARCHITECTURE.md](ARCHITECTURE.md) §4):
  - **Preferred relay** — `relay.obelisk.ar` (La Crypta) now leads `GAME_RELAYS`
    as the low-latency relay for our players; the public relays stay as
    redundancy/fallback. Since publishes resolve on the first relay to accept and
    inbound events dedupe by id, the fastest relay sets perceived latency.
  - **Anti-cheat plausibility checks** on untrusted inbound frames: `speed` is now
    bounded by `MAX_RUNNER_SPEED` at the schema boundary (a faster-than-possible
    frame can no longer fling a ghost via dead-reckoning), and the orchestrator
    drops a runner `t` stamped far in the future or a `finishTime` that is in the
    future or predates `startAt` (instant-victory exploit), tolerant of honest
    clock skew. Bathroom-break progress rewinds stay allowed.

  Note: ephemeral event kinds for high-frequency traffic (runner `21000`, control
  `21001`, finish `21002`) and client-side dead-reckoning interpolation for remote
  runners were **already** in place; this entry covers the relay + validation work.

- **Favicon + social preview image.** Generated a favicon / apple-touch icon
  and per-locale Open Graph + Twitter preview images from the brand blocks +
  palette (`next/og`), wired via the icon / `opengraph-image` file conventions
  plus `openGraph`/`twitter`/`metadataBase` metadata.

- **Lobby create → invite → start flow.** Replaced the ready/not-ready toggle:
  the host picks a runner, presses **Create race** (publishes the match and
  reveals the invite link — so a link can't be shared before the match exists),
  then **Start race** to begin with whoever's in. Joiners see "waiting for the
  host"; **Back** leaves the match. A joiner whose invite link yields no
  presence within 7s now sees a "race not found" screen with a way back to the
  browser. See [MULTIPLAYER.md](MULTIPLAYER.md).

- **MULTIPLAYER.md** — lobby flow + how to test multiplayer locally with two
  distinct Nostr identities (everything is keyed by pubkey).

- **🚀 Speed booster + "complicated zones" (playtest feedback).** A new third food
  kind (`boost`, the 🚀 rocket) grants a temporary speed burst (`SPEED.boost`,
  `BOOST.seconds`) that overrides sprint and spends **no energy**. Boosters are
  hand-placed in `track.ts` (`BOOST_ZONES`): each sits in its own (clean) lane
  with junk food filling some of the others — but the zone is **always
  dodgeable**, leaving the booster lane plus a guaranteed junk-free escape lane
  (max 2 of 4 lanes ever blocked at one distance). Grabbing the 🚀 is a precise
  merge; skipping it safely is always possible. The 🚀 is its own neutral food
  `kind`: the burst is forced on you (you can't brake out of it), so it can help
  or hurt — hence a big **+50** reward and a **yellow** halo (distinct from green
  good / purple junk). Its bubble is drawn **2× bigger** so it reads as a power-up,
  not a snack. New `boostPhrases` (es/en), `Sound.boost()`, and a 🚀 card in **How
  to play** (yellow chip).

- **Auto-start at 4/4 + the lobby browser hides started matches.** When the grid
  fills (4/4) the host now auto-sends the start signal (the manual Start button
  stays). Self-presence (kind 30078) gained a lobby `status`, and clients
  re-announce it when the match leaves "waiting", so the discovery browser drops
  matches that already started (only truly open ones remain joinable). New
  `MatchLobbyStatus` schema; `discovery.selectOpenMatches` filters non-waiting
  matches (unit-tested).

- **Lobby browser — discover & join open matches.** Signed-in players now land
  on a lobby home that lists open races off the relays (kind 30078 self-presence,
  aggregated by `matchId`) with each host's name and player count, plus a
  **Create race** button — instead of everyone silently hosting their own match.
  New `lib/multiplayer/discovery.ts` (pure aggregation: newest seat per pubkey,
  drops full/stale matches, unit-tested), `useMatchDiscovery` hook (its own relay
  subscription), and `components/game/match-browser.tsx`. Invite links still jump
  straight into a match. New `play.browser.*` strings (es/en).
- **⚡️ Zap the winner.** The results screen offers a manual Lightning tip to the
  winner (never shown to the winner themselves). The button opens a Nostr-style
  dialog to pick the **amount** (preset chips 21/100/1000/5000 + a custom field)
  and an optional **message** (suggested chips + a custom field). It resolves the
  winner's `lud16` via a new public `GET /api/lud16?pubkey=` (from the users
  table), runs the LNURL-pay flow — sending the message as the `comment` param
  when the recipient supports it — and pays the invoice with the viewer's WebLN
  wallet (`lib/lightning/zap.ts`). No custody, no backend secrets (ARCHITECTURE
  §7). Shows zapping / sent / friendly-error states (incl. a "need a Lightning
  wallet" hint). New `components/game/zap-winner.tsx`; `play.results.zap*`
  strings (es/en); the pure LNURL helpers are unit-tested.

- **End-of-match results screen.** When every runner finishes, the race swaps to
  a standings screen: a winner banner (🏆 You won! / 🏁 {name} wins), the final
  table — rank · player · time · points, with the local player's row
  highlighted — and **View leaderboard** / **Play again** actions. To match the
  global leaderboard exactly, its table was extracted into a shared presentational
  `components/leaderboard/ranking-table.tsx` (podium badges, player chip,
  configurable numeric columns) now used by both `LeaderboardTable` and the new
  `components/game/match-results.tsx`. `shortPubkey` moved to `lib/utils`. New
  `play.results.*` strings (es/en).

- **Match persistence → real leaderboard data.** When a real (≥2-player) match
  finishes, the host's client POSTs the final standings to a new
  `POST /api/matches` route, which writes a `matches` row + one `results` row
  per player via `persistMatchResult`. Idempotent: `matches` gained a unique
  `nostr_id` (the client match id, migration `0003`), so a retry upserts instead
  of duplicating, and `results` already dedupes on `(match_id, pubkey)`. The
  route is session-gated and only accepts a submission from the match's host
  (client-authoritative — an MVP tradeoff). The leaderboard's `getLeaderboard()`
  now has real rows to aggregate. New `lib/schemas/match.ts#PersistMatchSchema`;
  `store.ts` gained `upsertMatch` + `persistMatchResult` (replacing the unused
  `createMatch`/`finishMatch`). Needs `DATABASE_URL` to run; covered by
  integration tests against the Neon test branch (`tests/integration/`,
  skipped when no DB is configured) that verify persistence, leaderboard
  aggregation, and `nostr_id` idempotency.
- **Real multiplayer — join via invite link.** Two browsers can now race in the
  same match. The roster model moved from host-authoritative to **self-presence
  aggregation**: each peer publishes its own seat (kind 30078, replaceable per
  author) on the match channel and every client aggregates the presences into
  the roster — no server to own it. Joining is an invite link: the host's lobby
  shows a copyable `/play?m=<matchId>&h=<host>` URL; opening it joins that match
  instead of hosting a new one. `MatchClient.announceLobby`/`setRoster` were
  replaced by `announceSelf({lane,name})` (any peer); `matchFilter` now carries
  discovery so presence rides the same channel; `match-state` upserts seats by
  pubkey. The lobby reads `isHost` (joiners wait, host starts), and the host's
  start signal flips everyone into the race via match status. Verified end-to-end
  over **public Nostr relays** (two independent clients: roster converges, start
  propagates, runner state crosses, both resolve the same winner) plus a
  two-client unit test. Still pending: a browse-all-matches lobby screen (invite
  links cover joining for now).
- **Global leaderboard page.** New `/leaderboard` route (server component,
  `force-dynamic`) that renders the existing `getLeaderboard()` aggregation as a
  ranked table: rank · player (Nostr avatar + display name, falling back to a
  shortened pubkey and an initial badge) · wins · points · races, with a podium
  accent on the top three and the `races` column collapsing on phones. Reachable
  from a new **Leaderboard / Ranking** link in the navbar. Until match
  persistence is wired the query returns no rows, so the page shows a friendly
  empty state (and degrades to it if the DB is absent). New
  `components/leaderboard/leaderboard-table.tsx`; `leaderboard` + `nav.leaderboard`
  message keys added in both locales.
- **Lobby → race handoff.** The match now lives in a new `<MatchProvider>` above
  the whole competitive flow, so the lobby's `MatchClient` carries straight into
  the race instead of being thrown away on start. `useMatch` exposes the live
  `client`; the provider builds one `RaceNet` from it (and owns its lifecycle —
  the scene no longer disposes it), the lobby reads roster/start/announce from
  context, and `PlayStage` hands the race a `RaceNet` so the Phaser scene
  broadcasts + renders runners. The net is passed **only when ≥2 players are in
  the roster**, so a solo host keeps the plain single-player race (no lonely
  minimap, restart still works). `RunnerLobby` now consumes the context (its
  local-only fallback is unchanged). Last missing piece for a real race is the
  **join** flow (discover + join a host's match via kind 30078) — until then
  each player still hosts their own one-seat match.
- **Runner-select lobby, wired to the live match layer.** The character picker
  now reads as a 4-lane starting grid: numbered, color-accented lanes; hovering a
  runner flips it to its **back-facing** sprite (lined up at the blocks); claiming
  a lane swaps the character name for the player's **display name** (animated chip
  with Nostr avatar + "You" badge); open lanes show a dimmed/idle sprite; a `x/4`
  runner counter and a **Claim → Ready → Start** action flow. `RunnerSprite`
  gained a `facing` ("front" | "back") and `idle` prop; each `Character` gained a
  `laneColor`. The presentational `CharacterSelect` is now driven by a new
  `RunnerLobby` container that wires `useMatch`: the signed-in player hosts their
  own match, claiming a runner writes a seat into the host-authoritative roster
  (`lane = character.startLane`) and re-announces the lobby, and **Start** sends
  the synced start signal. Falls back to a local-only lobby when no live signer
  is available (nsec/NIP-46 reload). `/play` passes the signed-in user's
  `display_name`/`avatar_url`.
- **In-race multiplayer sync.** Wires the Phaser race to the multiplayer
  foundation through a small `RaceNet` seam (`lib/game/race-net.ts`) — the scene
  stays single-player by default (no `RaceNet` in the registry → none of it
  runs) and the lobby drops a live match in without touching the game loop:
  - `RaceScene` broadcasts the local runner each frame (throttled to ~5 Hz by
    the client), renders other players as translucent colored **ghosts** on the
    track, draws a **minimap** of everyone's progress, and announces its finish
    (kind 21002) once.
  - `lib/game/remote-runners.ts` — pure interpolation for remote runners
    (dead-reckoning from local receive time + easing) so ~5 Hz updates render
    smoothly at 60 Hz; lane-based color palette. Unit-tested.
  - `GameCanvas` gains an optional `raceNet` prop (forwarded via the game
    registry); `createGameConfig` takes it as a new optional arg.
  - Tests: the interpolator and `RaceNet` over two real `MatchClient`s on the
    in-memory transport (remote surfaced, self excluded, local broadcast seen
    by the peer).
- **Multiplayer foundation (Phase 2 groundwork).** The serverless realtime
  layer from `ARCHITECTURE.md §4` now exists in code — no UI yet, fully
  unit-tested. New `lib/multiplayer/`:
  - `transport.ts` — a thin `Transport` interface (publish/subscribe) with two
    implementations: `nostr-transport.ts` (public relays via `SimplePool`,
    dedupes by event id) and `memory-transport.ts` (in-process bus, makes the
    realtime contract testable with zero network).
  - `events.ts` + `lib/schemas/match.ts` — Zod-validated payloads and
    build/parse for the four event kinds (30078 discovery, 21001 control,
    21000 runner state, 21002 finish). Every inbound relay event is validated
    before it reaches state.
  - `match-state.ts` — a pure reducer: roster from discovery, newest-wins
    runner merge, winner resolved by earliest finish time (claimed positions
    are never trusted).
  - `match-client.ts` — orchestrator tying transport + reducer + a
    `SignerHandle`, with ~5 Hz broadcast throttling and a synced countdown;
    plus a `useMatch` React hook (`lib/hooks/use-match.ts`).
  - DB: `matches` + `results` tables (`lib/db/schema.ts`, migration
    `drizzle/0002`) reusing the existing `users.pubkey` identity, and
    server-only persistence/leaderboard queries in `lib/multiplayer/store.ts`.
  - Tests cover the schemas, the reducer, and two `MatchClient`s converging
    over the in-memory transport (same play state, runners and winner).

### Changed

- **Game header retitled** "Carrera multijugador / Multiplayer race" (was
  "Fase 1 · prototipo de un jugador").
- **Lobby card polish:** legible lane numbers (body font, larger badge), bigger
  cards, and long usernames now truncate with an ellipsis instead of overflowing.
- **Longer race & tighter stamina (playtest feedback).** Track length 7500 → 11000
  (`track.ts`) for a less abrupt race, and energy `drainPerSecond` 0.28 → 0.42
  (`config.ts`) so sprinting is a resource to ration rather than held constantly.

### Fixed

- **Late joiners now see who's already in the lobby.** Added a 5s presence
  heartbeat + a debounced re-announce when a new peer appears, so the roster
  converges even when public relays don't replay stored presence to a late
  subscriber.
- **No two players on the same character.** The state machine enforces one runner
  per lane — the earliest claim wins (tie-break: smaller pubkey) so every client
  agrees; the loser's card frees up with a "pick another" notice.
- **Hardened the race against accidental restarts.** `GameCanvas` only rebuilds
  the Phaser game when the locale/character changes — never on an ordinary
  re-render (the live snapshot ticks ~5 Hz). The poison→bathroom reset was
  already local-only; documented that there's no path for one player's reset to
  affect another.

### Changed (design)

- **Track reduced from 8 lanes / 8 players to 4 lanes / 4 players.** Two reasons:
  (1) **Mobile-friendly by design** — in the 2.5D behind-runner view the track
  narrows toward the horizon, and 8 lanes are unreadable/untappable in a portrait
  viewport; 4 lanes keep each lane wide enough to see and touch. (2) **Lighter
  realtime layer** — runner-state fan-out over public Nostr relays grows ~N², so
  4 players cut received traffic from ~35 to ~15 events/s per client (~¼ of the
  relay load) and downgrade the "relays rate-limit at scale" risk from Medium to
  Low. Also fewer characters/tints to design and a far more realistic playtest
  target (4 real people vs 8) before the pitch. Updated across `GAME-DESIGN.md`
  (lanes, player count, `lane 0..3`, auto-start 4/4), `ARCHITECTURE.md`
  (`TRACK.lanes: 4`, `max: 4`, `lane:0..3`), `ROADMAP.md` (milestones, playtest,
  risk register) and `CHARACTERS.md`.

### Fixed

- **Sign-out** left a valid session cookie (a bare `cookies().delete()` doesn't
  clear a `secure`/`sameSite` cookie), so the navbar showed "Login" but `/sign-in`
  bounced the user straight back. `clearSession` now overwrites the cookie with
  `maxAge: 0` + matching attributes.
- **Nostr profile fetch** (first login + "sync profile") returned empty because
  the configured relays (damus/primal/nostr.band) frequently EOSE with no kind:0
  event. Switched to a metadata-reliable relay set (purplepag.es + nos.lol first)
  and raised the query timeout 3s→6s, so name/avatar/lightning actually populate.
- **Game restart** left the food bubbles invisible: `resetRace()` didn't clear
  the `resolved` set, so the whole track stayed "already eaten". Cleared on reset.

### Changed

- **/play** no longer shows the "change runner" button — the runner is locked
  once the race starts (pick it before starting). Sign-in method/extension
  descriptions use the body font in natural case (not the pixel/uppercase Button
  style) for legibility.

### Added (account)

- **Nostr profile in the navbar**: once signed in, the Login button is replaced
  by the user's **Nostr avatar** (kind:0 `picture`, with a 🏃 runner fallback)
  which opens a small menu — display name, **lightning address** (`lud16`, for
  zaps), **"Sync profile from Nostr"**, and sign out. No full settings page; the
  sync action re-fetches kind:0 and overwrites name/avatar/lightning so the row
  tracks Nostr. New `lud16` column on `users` (migration `0001`), persisted on
  first login and on sync; `avatar_url` + `lud16` now travel in the session
  (`/api/auth/session`, layout `initialSession`). New `POST /api/auth/sync-profile`.

### Changed (login + UI polish)

- **Login page**: removed the "Back to home" link; method **descriptions**
  ("Paste your nsec directly", …) now use the body font (the pixel font wasn't
  legible at that size).
- **Modal** restyled to the platform arcade look: hard border + hard offset
  block (theme-aware `--arcade-edge`), small radius, pixel display-font title.
- **Game header** (play + demo) restyled to arcade: a pixel "back key", phase
  label, and the sound toggle pinned right (both as arcade keycaps). The demo's
  back key navigates to **/how-to-play**.
- **How-to-play**: Energy title uses 🔋, Zap-the-winner uses ⚡, and the score
  chips render their numbers in the body font (legible).
- **Buttons** are now uppercase platform-wide. Landing tagline title-cased
  ("Run, Eat, Win"); landing CTAs reordered to **How to play** (left) · **Play**
  (right).

### Added

- **`CONTRIBUTING.md`** — contribution guide: local dev, change/commit/PR
  conventions, code of conduct, vulnerability reporting, and the security
  hardening currently in place vs. still pending. Root-level.
- **Test script split** — `test:unit`, `test:integration`
  (`--passWithNoTests`), and `test:db:migrate` (migrates against `.env.test`)
  in `package.json`, backing the parallel CI jobs.

### Changed

- **README** rewritten — spoiler-free intro plus Stack / Quick start /
  Documentation / Sister projects / License sections (Cost: $0 kept).

- **Fake ads on mobile + every route** — the spam ads are no longer desktop-only
  or hidden over the game. Below the `1280px` side-rail breakpoint a single ad
  now **floats fixed to the bottom of the screen** (the classic annoying mobile
  web banner: horizontal layout, "Ad" badge, X to close, slide-up/down
  animations, `prefers-reduced-motion` aware), drawing from the same pool and
  dismissal logic as the desktop columns (so they never appear at once). The
  route exclusion was dropped, so ads also show on `/play` and `/demo` (columns
  on desktop, banner on mobile). Files: `components/layout/fake-ads/`.
- **Demo "watch an ad to continue" interstitial** — tapping **"Seguir jugando"**
  after a demo race now opens a full-screen fake interstitial (random ad, loud
  arcade card) with a bogus **"Skip ad in 5s"** countdown that gates the close
  button; only at zero does the ✕ unlock. Dismissing it ends the round and
  **starts a fresh race** (remounts `GameCanvas` via a bumped `runId` key).
  Tapping the ad routes to its `/gotcha/<slug>` gag page. New `fakeAds` keys
  `skipIn` / `skip` (es/en). Files: `components/game/interstitial-ad.tsx`,
  `components/game/play-stage.tsx`.

- **Free demo mode** (`/demo`): single-player race with the Sprinter (no
  character picker, no login). Crossing the finish line opens a modal inviting
  the player to sign in to compete for zaps (returns to `/play` after login).
  The game now surfaces a finish event to React via an `onFinish` callback
  (`createGameConfig` → registry → `RaceScene.checkFinish`).
- **Fake margin ads (prototype)** — "spam" banners pinned to the empty desktop
  page margins, rendered once from the shared `[locale]` layout so they appear on
  every page (side columns at `1280px`+; see the mobile banner entry above for
  smaller screens). Loud arcade styling (thick block border + hard
  offset shadow, rotated blinking sticker, "Ad" badge, X to close),
  `prefers-reduced-motion` aware. Closing a banner plays a **slide-out**, then
  after a short beat a fresh ad from the pool **slides in** from the same edge
  (dismissals persist in `sessionStorage`); clearing the whole **18-ad pool**
  reveals a small reward. Each ad has a **unique URL** (`/gotcha/<slug>`) but
  they all resolve to one dynamic gag page that renders a **different
  bitcoin/nostr/lightning-scam-debunking joke per slug** (18 gags + a generic
  fallback for unknown slugs); gag CTAs only point to safe pages (home /
  how-to-play), never the game. Copy is i18n'd (`fakeAds` namespace, es/en).
  Files: `lib/fake-ads/ads.ts`, `components/layout/fake-ads/`,
  `app/[locale]/gotcha/[slug]/`.
- **Custom 404** — themed `app/[locale]/not-found.tsx` (pixel "404" + runner,
  arcade styling) plus an `app/[locale]/[...rest]` catch-all that triggers it so
  unknown localized paths render the styled 404 **inside** the layout (navbar,
  footer, providers, fonts) instead of Next's bare default. New `notFound` i18n
  namespace (es/en).

### Changed

- **`/play` now requires login** — anonymous visitors are redirected to
  `/sign-in?next=/play` (they can still try `/demo`).
- **How-to-play redesigned**: wrapped in `<Container>`, fully responsive card
  grid (3→2→1 columns) with **Framer Motion** entrance animations. Added the
  missing **Zap the winner** and **Ranking** cards; the Energy/Junk cards now
  show **per-food score chips** (💧+5 🍌+8 🧃+14 ⚡+20 / 🍩−5 🍟−8 🍔−12 🍺−16),
  and Controls use the **custom arrow-key icons** in keycaps. Added an outlined
  **Demo** button beside **Play now**.
- **Locale**: disabled `Accept-Language` auto-detection (`localeDetection:
false`) so the prefix-free default (es) always loads at the root —
  run.bitbybit.com.ar shows es; `/en/*` is the English variant via the toggle.

### Changed (design)

- **Dark-mode arcade fix**: added an `--arcade-edge` token (dark on light /
  light on dark) so the hard border + offset shadow of buttons, cards, the
  locale/theme toggle and logo blocks stay visible on the dark background
  (neon-sticker look) instead of vanishing into it. Title text-shadows and the
  (white) polaroids keep the dark `--pixel-shadow`.
- **Landing polish**: the hero title uses the wordmark treatment (gradient
  "RUN") with the **Bitcoin "₿" as each capital B** of BitByBit (same color as
  the rest of the word — dark indigo on light, white on dark). The 4 runners sit
  inside tilted **polaroid** frames, wrapped in a reusable `<Container fill>`:
  flanking the center on desktop (≥1024px), and **2 above / 2 below** the text on
  tablet & mobile. **Framer Motion**: spring "pop" + idle wobble on the title,
  staggered entrance + idle float + hover lift/straighten on the polaroids (all
  respecting `prefers-reduced-motion`). Shorter two-line tagline ("Corré, comé,
  ganá 🏃💨 / El cardio nunca pagó tan bien. ₿"), smaller hero/tagline type on
  mobile. The **locale/theme toggle** uses the white pixel/arcade style, the
  **primary pink button** flips to white bg + pink text on hover, the footer was
  made fully responsive (centered, wrapping links on mobile), and the redundant
  "Cómo jugar" footer link was removed. `Container` gained a `fill` variant for
  single-screen pages.
- **Arcade overhaul**: new "Arcade Night" palette (indigo + pink/green/yellow,
  light variant too), **Pixelify Sans** pixel display font (titles, buttons, and
  the in-game canvas text), and **blocky arcade buttons/cards** (hard border +
  offset shadow + press). Logo blocks/wordmark recolored.
- **Landing** redesigned: shows all 4 characters with names + a humor tagline.
- **Single-screen** layout (sticky footer): landing, how-to-play, play and the
  **restyled sign-in** all fit one screen on desktop/tablet (footer included).
- **Responsive** verified on mobile + tablet (no overflow; cards reflow to 2×2,
  NIP-46 buttons stack).

### Added

- **Nostr login (Phase 2)** — ported the full sign-in system from
  `bitbybit-cursats`: `/sign-in` with all connection methods (NIP-07 extension,
  NIP-46 bunker/QR for Amber/nsec.app, raw nsec, create-new-identity),
  `SignerContext`, NIP-98 auth, JWT session (`jose`), and a **Neon + Drizzle**
  `users` table (trimmed to auth fields). Signer-aware navbar, vitest tests (55),
  `db:migrate`. Env in `.env.example`; details in [AUTH.md](AUTH.md).
- **Sound effects** — synthesized with the Web Audio API (zero assets, zero
  bytes): GO, eat good/junk, lane-change tick, a deliberately annoying **bathroom
  alarm** (dissonant detuned saws + LFO tremolo + noise splat + deflate), a
  **drunk beer wobble** (vibrato LFO), and a **finish jingle with reverb**
  (ConvolverNode). `lib/game/sound.ts` + a 🔊 mute toggle (localStorage) on `/play`.
- **Single-player depth & humor:**
  - The runner is now an **animated character** (swinging legs/arms, bob) instead
    of a circle, with a bathroom shake and a tipsy sway after beer.
  - **8 foods** (`lib/game/foods.ts`): water/banana/isotonic/gel (good) and
    donut/fries/burger/beer (junk), each with its own energy/toxicity and score.
  - **Crowd + funny signs**: bitcoiner/libertarian billboards line the track
    ("Taxation is theft, cardio is freedom", "HODL your legs"…) and a colorful
    crowd fills the stands.
  - **Varied, random eating phrases** with humor; **random bathroom lines**.
  - Beer adds a brief **drunk wobble**.
  - Longer match (track length 7500) with **many more signs & eating phrases**.
  - Bathroom break is now an **instant restart with a ~1s pause** at the start
    (start line + numbers visible again), not an animation.
  - Bigger, readable crowd signs; removed the horizon crowd; isotonic icon 🧃.
  - **Optional runner sprite sheet**: drop `public/sprites/runner.png` and the
    game animates it (Phaser anim); otherwise it falls back to the vector runner.
    See `public/sprites/README.md` for the spec + an AI prompt.
  - **Real runner sprite** (PixelLab): back-facing run cycle in the game, plus a
    front-facing CSS-animated `<RunnerSprite>` on the landing.
- `docs/CHARACTERS.md` — playable characters (PixelLab prompts/settings + the
  sprite pipeline) and `lib/game/characters.ts` — the character catalog.
- **Character selector**: a "Choose your runner" screen on `/play` (animated
  front-facing cards) → start the race as the picked character, with a "Change
  runner" link. The scene loads each character's sheet via the registry
  (`createGameConfig(..., sprite)`); `<RunnerSprite>` is now per-character.
- **Three more characters**: Barbie (`female`, 124²), T-Rex (`trex`, 120²) and
  the **Bitcoin coin** (`coin`, 112²) — catalogued in `lib/game/characters.ts`.
  Curated source frames live under `assets/characters/<id>/{north,south,rotations}`;
  raw root exports git-ignored. (The kawaii banana was dropped — too horizontal
  from the back.)
- **App shell & navigation:**
  - Global **Navbar** (brand logo left, locale/theme toggle + Login button right).
  - **Footer** (BitByBit RUN wordmark + links: How to play, Cursats, Habits,
    Arena, GitHub) — shown on every page except the full-screen game.
  - Shared brand components: `LogoBlocks`, `Wordmark` (gradient "RUN"), `Logo`.
  - **Locale + theme toggle** as a cursats-style segmented pill (emoji ☀️/🌙 +
    EN/ES).
  - Round, icon-only **back button** (custom arrow, no label) on the play page.
  - **How to play** page (`/how-to-play`) replacing the FAQ idea.
- **In-game localization:** the canvas text (GO!, food toasts, bathroom, FINISH)
  now follows the active locale (strings passed from React into the scene).

### Changed (UI/feel)

- The track now reaches the **horizon** and shows the **bend** (the oval curving
  away) at the far end.
- Food is rendered inside a **bubble** (translucent sphere + highlight + specular
  dot), echoing cursats' bubble surface.
- The game canvas is **vertically centered** on the play page.
- Bathroom-break toast stays on screen longer (2.4s) so it's readable.
- Track now starts at the bottom edge, with a **start line** at the beginning and
  **lane numbers 1–8 painted flat on the floor** (athletics-track reference).
- The bend now sweeps **left** and carries the lane lines into the curve.
- Brand `LogoBlocks` are vertically stacked ceramic blocks (matching cursats).
- Controls hint sits **directly under the canvas** (not pinned to the page).
- The track is now drawn as **pseudo-3D segments**: a straight that eases into a
  left curve (no kink at the junction) and tapers/fades smoothly into the
  horizon (lane lines thin + fade with distance).
- **Start line + lane numbers** are world elements at the start: only visible at
  the beginning (with an "on your marks" hold) and recede as you run, mirroring
  the finish line. Numbers are painted flat on the floor.
- Controls legend rebuilt as a component with **custom arrow-key icons** and the
  **WASD alternatives** shown.

### Added

- **First style pass** (daytime athletics look):
  - Re-skinned the track: daylight sky gradient, **orange tartan track**, **green
    grass** on the sides, white lane lines, checkered finish, runner with shadow.
  - **Food is now icons, not plain circles**: good food = ⚡ on a green halo,
    junk = 🍔 on a red halo (icon + color so good vs junk is obvious).
  - Canvas text uses the **Nunito** font (same family as `bitbybit-cursats`),
    on a translucent HUD panel with ⚡/🍔 bar labels.
  - Reusable `Button` component ported from `bitbybit-cursats` (ceramic-surface
    style) using our orange/green palette; used on the landing & play pages.
  - SCSS token system extended (accent + ceramic tints, `_common-mixins`,
    `_media-mixins`).
- **Phase 1 scaffold** — playable single-player prototype:
  - Next.js 16 (App Router, Turbopack) project following `bitbybit-cursats`
    conventions: root-level layout (no `src/`), SCSS token system under
    `styles/`, `next-intl` i18n (`[locale]` routing, ES default + EN),
    `next-themes` light/dark, ESLint/Prettier/EditorConfig.
  - Phaser game (`lib/game/`): fake-2.5D track, 8 lanes, keyboard controls
    (lane change / sprint / brake), energy & poison bars, fixed-position food,
    bathroom-break restart, finish line, points, and a finish overlay.
  - `components/game/game-canvas.tsx` mounts Phaser client-side only.
  - Verified: `typecheck`, `build`, and route smoke test (ES/EN) all pass.
- Initial project documentation:
  - Root `README.md` — overview, tech stack, hackathon scoring map.
  - `docs/GAME-DESIGN.md` — game concept, rules, mechanics, screens, match flow.
  - `docs/ARCHITECTURE.md` — serverless free architecture (Next.js + Phaser,
    Nostr transport, kind 30078 discovery, Neon Postgres, manual Lightning zaps).
  - `docs/ROADMAP.md` — 3-phase plan toward the Jun 23 pitch with risk register.
  - `docs/README.md` — documentation index.
  - `docs/CHANGELOG.md` — this changelog.

### Changed

- Tuned race feel: faster speeds (base 130 → 180) and track length retuned to
  4500 (was 1500 → too short, then 6000 → too slow). Energy starts at 50%.
- Removed the duplicated in-canvas controls hint (kept the translated one below).
- Static backdrop is drawn once; only moving pieces redraw each frame.

### Decided

- Game concept: 8-lane athletics runner race with an energy/poison food loop.
- View: 2.5D behind-the-runner (faked via sprite scaling in Phaser).
- Architecture A (lightweight & free): Phaser + Nostr ephemeral events as the
  realtime transport, no dedicated game server.
- Persistence: Neon Postgres + Prisma for leaderboard & match history.
- Lightning rewards: manual zap of the winner via their `lud16` address.

---

_Changelog started 2026-06-03._

# 🏗️ Architecture — Bit by Bit Run

## 0. Guiding constraints

1. **Free.** Open-source hobby project → only free tiers, no always-on server.
2. **Lightweight.** Low-weight web game, fast to load.
3. **Solo-buildable** in ~3 weeks (deadline: pitch on June 23).
4. **On-theme.** Deep Nostr + Lightning integration (it's a scoring axis).

The central design decision that satisfies all four: **use Nostr relays as the
real-time backbone instead of a dedicated game server.**

## 1. High-level overview

```
                         ┌───────────────────────────┐
                         │     Public Nostr relays    │  ← our "realtime server"
                         │  (damus, nos.lol, primal)  │     (free, no ops)
                         └─────▲──────────────▲────────┘
        publish own state      │              │   subscribe to others' state
        (ephemeral, ~5 Hz)     │              │
                   ┌───────────┘              └───────────┐
                   │                                      │
            ┌──────┴───────┐                       ┌──────┴───────┐
            │  Player A     │   ...up to 8...       │  Player H     │
            │  (browser)    │                       │  (browser)    │
            │  Next.js +    │                       │  Next.js +    │
            │  Phaser game  │                       │  Phaser game  │
            └──────┬────────┘                       └──────┬────────┘
                   │  HTTPS (leaderboard, history)         │
                   └──────────────┬───────────────────────┘
                                  ▼
                      ┌────────────────────────┐
                      │  Next.js API routes      │  (Vercel serverless)
                      │           +              │
                      │  Neon Postgres (Drizzle) │  ← persistent data (free)
                      └────────────────────────┘
```

There is **no game server**. Vercel only serves the app and a few stateless API
routes; the realtime layer is Nostr; persistence is Neon.

## 2. Tech stack

| Layer                     | Choice                                             | Why                                                                 |
| ------------------------- | -------------------------------------------------- | ------------------------------------------------------------------- |
| App shell / routing / API | **Next.js 16 (App Router, Turbopack)** on Vercel   | Free, SSR for landing/SEO, serverless API routes                    |
| Styling                   | **SCSS modules + CSS-variable tokens** (`styles/`) | Matches `bitbybit-cursats` conventions                              |
| i18n                      | **`next-intl`** (`[locale]` routing)               | Spanish default, English; `proxy.ts` middleware                     |
| Theme                     | **`next-themes`** (`data-theme`)                   | Light/dark with a token flip                                        |
| Game rendering            | **Phaser**                                         | Batteries-included 2D engine; fake-2.5D via sprite scaling; ~500 KB |
| Realtime transport        | **Nostr ephemeral events** (`nostr-tools`)         | Free, serverless, on-theme                                          |
| Match discovery (lobby)   | **Nostr kind 30078** (NIP-33)                      | Reuses La Crypta's `gorilator-rpg` pattern                          |
| Auth / identity           | **`nostr-login`** (NIP-07)                         | No passwords; players already have npubs                            |
| Database                  | **Neon Postgres + Drizzle ORM**                    | Free serverless Postgres; native Vercel integration                 |
| Payments                  | **Manual zap** via `lud16` + WebLN                 | Simplest reliable Lightning reward                                  |

### Why Next.js _and_ Phaser?

React/Next is bad at _rendering a game_ (re-renders, no sprite/physics model) but
great for everything around it. So we split:

- **Next.js** owns: landing, login, lobby, rules, results, leaderboard, API.
- **Phaser** owns: the `<canvas>` race. It's mounted in a client-only component
  via `next/dynamic` with `{ ssr: false }`, living in its own DOM node — it does
  not fight React.

### Project structure (root-level, no `src/`)

```
app/[locale]/        Localized routes (layout, landing page, play/)
components/game/      GameCanvas — mounts Phaser client-side only
components/ui/        Shared UI (e.g. ThemeToggle)
lib/game/             Game logic: config.ts, track.ts, scenes/race-scene.ts
lib/contexts/         ThemeProvider (next-themes wrapper)
i18n/                 next-intl routing.ts + request.ts
messages/             en.json, es.json
styles/               SCSS token system (_theme, _colors, _typography, _spacing)
proxy.ts              Next 16 middleware (next-intl locale routing)
```

## 3. The static track model

The track (lane count, length, and every food item's position) is **static data
shared by all clients** — defined once in a TypeScript module and imported by
everyone.

```ts
// shared/track.ts (illustrative)
export const TRACK = {
  id: "classic-v1",
  lanes: 4,
  length: 1000,                       // abstract units to the finish line
  goodFood:  [{ lane: 2, at: 120 }, { lane: 5, at: 300 }, ...],  // hydration
  junkFood:  [{ lane: 3, at: 200 }, { lane: 6, at: 260 }, ...],  // obstacles
}
```

Because the world is identical and deterministic for everyone, **no food/world
state is ever synchronized**. Each client only broadcasts its _own runner_.
(If we later want randomized tracks, the host puts a `seed` in the start event
and all clients generate the same track from it.)

## 4. Nostr event design

All events are scoped to a `matchId`. We use a project tag `t = "bitbybit-run"`.

### 4.1 Match discovery — kind `30078` (parameterized replaceable, NIP-33)

Published & updated in place by the **host**. Lets the lobby list open matches.

```jsonc
{
  "kind": 30078,
  "tags": [
    ["d", "bitbybit-run-<matchId>"], // addressable id
    ["t", "bitbybit-run"], // discovery filter
    ["status", "waiting"], // waiting | playing | finished
    ["players", "3"],
    ["max", "4"],
    ["name", "Analia's race"],
  ],
  "content": "{ matchId, host, trackId, players:[{pubkey,lane,name}], createdAt }",
}
```

Lobby subscribes: `{ "kinds":[30078], "#t":["bitbybit-run"], "#status?":["waiting"] }`.

### 4.2 Match control — kind `21001` (ephemeral)

Sent by the host to start the race. `startAt` gives everyone a synced countdown.

```jsonc
{
  "kind": 21001,
  "tags": [["d", "<matchId>"]],
  "content": "{ type:'start', matchId, trackId, startAt:<unixMs> }",
}
```

### 4.3 Realtime runner state — kind `21000` (ephemeral), ~5 Hz

Each player broadcasts **only their own runner**. Tiny payload, throttled.

```jsonc
{ "kind": 21000, "tags": [["d","<matchId>"]],
  "content": "{ pubkey, progress:0..1, lane:0..3, speed, energy:0..1, poison:0..1,
               status:'running'|'bathroom'|'finished', points, t:<unixMs> }" }
```

Subscribe: `{ "kinds":[21000], "#d":["<matchId>"], "since": now }`.
Receivers **interpolate** remote runners for smoothness (dead-reckoning +
easing, `lib/game/remote-runners.ts`): between ~5 Hz samples a ghost is advanced
by its last known `speed` (capped window) and the displayed value eases toward
that target, so latency only affects how fresh the _minimap_/ghosts look, never
your own (local) runner.

### 4.4 Finish / result — kind `21002` (ephemeral)

Each client announces its finish; the **earliest** `finishTime` is the winner.

```jsonc
{
  "kind": 21002,
  "tags": [["d", "<matchId>"]],
  "content": "{ pubkey, finishTime:<unixMs>, position, points }",
}
```

### 4.5 Validating untrusted frames (anti-cheat)

With no authoritative server, every inbound frame comes from an untrusted peer, so
each client validates before merging (`lib/multiplayer`):

- **Structural / range** — all four payloads pass through the Zod schemas
  (`lib/schemas/match.ts`) in `parseEvent`; a malformed event is dropped. `speed`
  is bounded by `MAX_RUNNER_SPEED` (1.5× the boost speed), so a frame claiming a
  faster-than-possible speed can't fling its ghost across the track via
  dead-reckoning extrapolation.
- **Timestamp plausibility** — the orchestrator (`match-client.ts`) drops a runner
  `t` stamped implausibly far in the future (it would pin that peer as forever
  "newest" under newest-wins and freeze its ghost) and a `finishTime` that is in
  the future or **predates `startAt`** (the earliest finishTime wins, so a past
  stamp would be an instant illegitimate victory). Honest clock skew is tolerated
  via `STAMP_SKEW_TOLERANCE_MS`.
- **Not** monotonic progress: a full poison bar legitimately sends a runner to the
  bathroom (back to the start line), so progress is allowed to rewind.

The reducer (`match-state.ts`) stays pure/clock-free; the clock-dependent checks
live in the orchestrator.

### Relays

A short list of fast, write-friendly relays (`lib/multiplayer/relays.ts`).
`relay.obelisk.ar` (La Crypta) leads as the **preferred** low-latency relay for
our players, with `relay.damus.io`, `nos.lol`, `relay.primal.net` as
redundancy/fallback. Publishes resolve on the first relay to accept and inbound
events dedupe by id, so the fastest relay to deliver sets perceived latency.
**Throttle** broadcasts to ~5 Hz and keep payloads small to respect rate limits.

## 5. Persistence — Neon Postgres + Drizzle ORM

Used for everything that must **survive** and be **queryable** across matches.
(Drizzle is the ORM used across the `bitbybit-*` projects.)

Suggested tables (Drizzle schema):

- `players` — `pubkey` (pk), `name`, `avatar`, cached profile, totals.
- `matches` — `id`, `trackId`, `hostPubkey`, `startedAt`, `finishedAt`.
- `results` — `matchId`, `pubkey`, `position`, `points` (one row per player/match).
- `leaderboard` (view or query) — aggregate wins & points per `pubkey`.

Written via **Next.js API routes** (Vercel serverless) when a match ends. The
client posts the final standings; the route validates basic shape and upserts.
Free tier: Neon scale-to-zero, native Vercel integration.

> Why a DB instead of storing the leaderboard on Nostr? Reliability and easy
> queries. Aggregating/ranking from scattered Nostr events is fiddly; Postgres is
> the right tool. (Publishing results to Nostr too, as a bonus, is optional.)

## 6. Auth — Nostr login (NIP-07)

- Use `nostr-login` to connect a NIP-07 signer (Alby, nos2x, etc.).
- Identity = the user's **npub/pubkey**. Fetch their profile (kind 0) for name &
  avatar, and their `lud16` Lightning address for zaps.
- No passwords, no email, no session DB needed for auth.

## 7. Lightning rewards — manual zap

- On the results screen, show the winner's `lud16` Lightning address (from their
  Nostr profile) and a **⚡ Zap winner** button.
- Since players are already logged in with Nostr, the button triggers a zap via
  **WebLN** (e.g. Alby) / LNURL-pay to the winner's address.
- No custody, no backend secrets. (Automated NWC payouts are possible future work
  via a serverless function — out of MVP scope.)

## 8. Why this is robust despite public-relay latency

- **Your own runner is local & authoritative** → always smooth, no input lag.
- **Remote runners** are shown mainly on the **minimap** (low fidelity) and as
  interpolated ghosts → a 100–300 ms delay is invisible.
- **The world is static** → no food/obstacle sync to get out of step.
- Net traffic per player is a tiny JSON at ~5 Hz → well within relay limits.

## 9. Free-tier budget

| Service              | Used for                        | Cost     |
| -------------------- | ------------------------------- | -------- |
| Vercel               | App hosting + API routes        | $0       |
| Public Nostr relays  | Realtime transport + discovery  | $0       |
| Neon                 | Postgres (leaderboard, history) | $0       |
| WebLN / user wallets | Zaps                            | $0 (P2P) |

**Total infrastructure cost: $0.**

## 10. Future work (post-MVP)

- Authoritative netcode (Colyseus or Cloudflare Durable Objects) for anti-cheat.
- Automated Lightning payouts via NWC (NIP-47).
- Randomized/seeded tracks, mobile touch controls, audio, richer art.

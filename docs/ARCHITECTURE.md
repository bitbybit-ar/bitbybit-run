# 🏗️ Architecture — BitByBit RUN

## 0. Guiding constraints

1. **Free.** Open-source project → only free tiers, no always-on server.
2. **Lightweight.** Low-weight web game, fast to load.
3. **On-theme.** Deep Nostr + Lightning integration.

The central design decision that satisfies all three: **use Nostr relays as the
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
            │  Player A     │   ...up to 4...       │  Player D     │
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
proxy.ts              Next 16 middleware (locale routing + rolling session re-mint)
```

## 3. The deterministic, per-match track model

The track (lane count, length, and every food item's position) is **deterministic
data derived from a seed** — built once per match from the `matchId` via
`buildTrack(seed)` (`lib/game/track.ts`, seeded PRNG in `lib/game/rng.ts`).

```ts
// lib/game/track.ts (illustrative)
export function buildTrack(seed: string | number): Track // seeded layout
export const TRACK = buildTrack("classic-v1"); // single-player / demo default
```

Every player in a match builds the **identical** track from the shared `matchId`
(no syncing), while **different matches get different obstacle/food layouts**.
The length stays constant (so remote dead-reckoning is unaffected); only the
food/obstacle positions, lanes and types vary. Booster gauntlets stay dodgeable
on every seed (the 🚀 lane plus a guaranteed junk-free escape lane).

Because the world is identical and deterministic within a match, **no food/world
state is ever synchronized** — each client only broadcasts its _own runner_. The
seed is simply the `matchId`, which every client already shares (invite link +
presence), so the layout needs no extra event.

## 4. Nostr event design

All events are scoped to a `matchId`. We use a project tag `t = "bitbybit-run"`.

### 4.1 Match discovery — kind `30078` (parameterized replaceable, NIP-33)

Published & updated in place by the **host**. Lets the lobby list open matches.

```jsonc
{
  "kind": 30078,
  "tags": [
    ["d", "<matchId>"], // addressable id — the bare matchId (rides the same channel as control/runner/finish)
    ["t", "bitbybit-run"], // discovery filter
    ["status", "waiting"], // waiting | countdown | playing | finished
    ["max", "4"],
    ["name", "Analia"], // optional: the peer's display name
  ],
  "content": "{ matchId, trackId, host, pubkey, lane, name?, raceName?, status, createdAt, sessionKey, left? }",
}
```

There is **no server roster**: each peer announces its _own_ seat (replaceable
per author), and every client aggregates the presences. `status` rides the
presence (and is retained by relays), so a client that (re)joins after the
ephemeral control/finish events are gone still learns the match already started
or finished — which is what blocks late joins and stops a returning player from
restarting it. `sessionKey` is this peer's ephemeral per-match signing key (see
§4.3): announced once here, signed by the real identity, binding the two.

Lobby subscribes: `{ "kinds":[30078], "#t":["bitbybit-run"] }` — status is _not_
filtered server-side; the client drops full/started/stale matches when it
aggregates the presences (see `selectOpenMatches`).

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
your own (local) runner. Rivals are drawn as their **actual animated character
sprite** (by lane), not a dot.

**Signing without per-frame prompts.** These ~5 Hz frames (and the finish, §4.4)
are signed locally with an **ephemeral per-match key**, not the real identity —
so a remote signer (Amber / NIP-46) is never prompted mid-race. The real identity
signs the presence once (§4.1), announcing + binding that session key; the frame
`content` still carries the **real** `pubkey`, so roster/standings/leaderboard are
unchanged. See §4.5 for the binding check that keeps this from being spoofable.

### 4.4 Finish / result — kind `21002` (ephemeral)

Each client announces its finish; the **earliest** `finishTime` is the winner.

```jsonc
{
  "kind": 21002,
  "tags": [["d", "<matchId>"]],
  "content": "{ pubkey, finishTime:<unixMs>, position, points }",
}
```

**The race ends once every runner has crossed** — each finish is recorded but
the others keep racing; finishers wait on a live-ranking screen meanwhile. A
`FINISH_GRACE_MS` (20s) timeout armed off the first finish (in `match-client.ts`)
bounds the wait: anyone still out when it fires is ranked DNF. Final order is
finishers by earliest `finishTime`, then non-finishers, with an **arrival
placement bonus** (`POINTS.placement`) folded into totals so where you reached
the line counts toward the ranking (`resolveStandings` in `match-state.ts`).

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
- **Not** monotonic progress: a full poison bar legitimately knocks a runner back
  a bounded distance (the bathroom break), so progress is allowed to rewind.
- **Session-key binding** — runner/finish frames are signed by the sender's
  ephemeral session key (§4.3), and their `content` claims a real `pubkey`. A
  frame is accepted only if that pubkey announced this exact session key in its
  presence (§4.1); otherwise it's a spoof and dropped.

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
- `leaderboard` (view or query) — per `pubkey`: wins (1st places) and the
  player's personal best (max points in a single match). Ordered by wins, then
  personal best — peak performance, not a lifetime sum.

Written via **Next.js API routes** (Vercel serverless) when a match ends. *Any*
participant's client posts the final standings (not just the host's), so a match
isn't lost if the host leaves before it resolves; the route validates basic
shape, checks the submitter is one of the players, and upserts idempotently by
`nostrId` so concurrent posts never duplicate. Free tier: Neon scale-to-zero,
native Vercel integration.

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
- **No-wallet fallback.** Resolving the winner's address to a BOLT11 invoice
  (LNURL-pay) is independent of having a wallet. So when the viewer has no WebLN
  provider — or the WebLN payment is declined/errors — we still fetch the invoice
  for the chosen amount + message and present it as a **QR code + copyable string
  + `lightning:` deep link**, payable from any mobile/desktop Lightning wallet.
  (`getZapInvoice` / `payWithWebln` in `lib/lightning/zap.ts`.)
- No custody, no backend secrets — payments are peer-to-peer.

## 8. Why this is robust despite public-relay latency

- **Your own runner is local & authoritative** → always smooth, no input lag.
- **Remote runners** are shown as interpolated character sprites + the **minimap**
  (low fidelity) → a 100–300 ms delay is invisible.
- **The world is deterministic per match** → no food/obstacle sync to get out of
  step.
- Net traffic per player is a tiny JSON at ~5 Hz → well within relay limits.

## 9. Free-tier budget

| Service              | Used for                        | Cost     |
| -------------------- | ------------------------------- | -------- |
| Vercel               | App hosting + API routes        | $0       |
| Public Nostr relays  | Realtime transport + discovery  | $0       |
| Neon                 | Postgres (leaderboard, history) | $0       |
| WebLN / user wallets | Zaps                            | $0 (P2P) |

**Total infrastructure cost: $0.**

# 🔍 Platform Audit — Bit by Bit Run

_Audit date: 2026-06-15. Read-only review of the whole platform across four
dimensions: **security**, **responsiveness/mobile**, **consistency** (game ↔
docs ↔ pages ↔ i18n), and **tests**. Each finding has a severity and a file
reference. This is a snapshot — re-run after major changes._

Severity: **Critical** (exploitable / data-corrupting / broken for users) ·
**High** · **Medium** · **Low** (polish).

---

## Executive summary

The codebase is well-structured: Zod validation at every untrusted boundary, no
`dangerouslySetInnerHTML`, parameterized Drizzle queries, `httpOnly`/`secure`/
`sameSite=strict` cookies, a proper NIP-98 signed login, a genuinely responsive
Phaser canvas, and a high-quality behavior-focused test suite for the match
state machine.

The headline gaps:

1. **Leaderboard is forgeable** — a logged-in client can POST a fully fabricated
   match (unbounded points, self at position 1, unlimited fake races). _Critical._
2. **No mobile `viewport` meta** — phones render the site at desktop width and
   zoom out, undermining the otherwise-responsive layout. _High._
3. **No rate limiting** anywhere, incl. relay-fanout auth routes. _High._
4. **User-facing copy says "8-lane" track** — the game has 4 lanes. _High._
5. **Leaderboard aggregation + several recent features are only covered by a
   DB-gated integration test that doesn't run in CI.** _High (tests)._

Recommended fix order: **#1 → #3 → viewport → 8-lane copy → test gaps → headers/
nonce → polish.**

---

## 1. Security

### Critical

- **Leaderboard forgery via unbounded, unvalidated standings.** _(Partially
  mitigated 2026-06-15 — see below.)_
  `app/api/matches/route.ts` + `lib/schemas/match.ts`. The only authorization on
  match persistence is "the submitter's pubkey appears in `standings`". A
  logged-in user could POST a fabricated match with themselves at `position: 1`
  (the board ranks by `count(*) filter (where position = 1)` — `store.ts`), **any
  32-bit `points`** (→ `bestPoints = max(points)` became an unbeatable record),
  arbitrary other pubkeys, and a fresh `nostrId` per forged match to mint
  unlimited fake `races`/`wins`.
  **✅ Done:** `points` bounded to `MATCH_POINTS_MIN/MAX` and `position` to
  `LANES` at every boundary (live frames + standings); standings must be unique
  pubkeys forming a contiguous `1..N` set. This stops absurd values, nonsense
  positions, and duplicate winners.
  **⏳ Remaining:** a participant can still self-report a *plausible* win/score —
  the leaderboard is still client-authoritative. Full fix needs
  multi-participant attestation (signed standings agreed by ≥2 players), which
  is the documented MVP gap.

### High

- **NIP-98 login replay window (no nonce store).** `lib/nostr/verify.ts:56,130`.
  Auth events are accepted within ±10s with no used-`event.id` store, so a
  captured `Authorization: Nostr …` header can be replayed within 10s to mint a
  session. Bounded but real; needs the deferred single-use-nonce store.
- **No rate limiting on any API route.** _(Mitigated 2026-06-15.)_ Worst cases:
  spam forged matches (compounds the Critical), and `POST /api/auth/sync-profile`
  / `POST /api/auth/nostr` each fan out to public relays with a ~6s wait → cheap
  relay-amplification DoS; `GET /api/lud16` allows unauthenticated enumeration.
  **✅ Done:** per-IP fixed-window limits via `lib/rate-limit.ts` on the four
  sensitive routes (login 20/min, sync-profile 10/min, matches 60/min, lud16
  120/min) — generous enough never to block real play (the realtime relay
  traffic is client-side and never hits the server, so it's unaffected).
  **⏳ Remaining:** the counter is in-memory (per serverless instance, resets on
  cold start) — a cluster-wide guarantee needs a shared store (Upstash/Redis).

### Medium

- **No CSP / security headers.** `next.config.ts:11` (CSP is a TODO). No
  `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`,
  `X-Content-Type-Options`, `Referrer-Policy`. Combined with arbitrary
  Nostr-controlled `avatar_url` rendered as raw `<img src>`
  (`ranking-table.tsx:96`, `account-menu.tsx`), no defense-in-depth against
  clickjacking and an attacker-chosen URL fetched by every leaderboard viewer
  (passive IP/tracking leak). _Text_ names are safe (React escapes them.)
- **Client-side fetch to attacker-controlled Lightning host.**
  `lib/lightning/zap.ts:55-90`. `lud16` domain is only `^[a-z0-9.-]+$`, so a
  hostile profile makes the victim's browser fetch an arbitrary host; the
  send-amount is clamped to the *recipient's* advertised min/max, so a hostile
  endpoint can demand more than intended. Surface the clamped `sats` prominently
  before `payWithWebln`.

### Low

- **Session-key frame binding fails open.** `match-client.ts:442` `boundSigner`
  returns `true` when the claimed pubkey's presence hasn't propagated yet → a
  peer can briefly inject frames as anyone. Only affects local animation/live
  standings (relay-side forgery is the real impact, see Critical).

### Confirmed NOT issues
500s never leak stack traces (stable string codes, `console.warn` server-side
only); session token fails closed and re-checks `active`; `__Host-` cookie in
prod; `AUTH_SECRET` throws if unset in prod; no SQL injection (typed Drizzle,
only safe `excluded.*` in ON CONFLICT); no hardcoded secrets; only
`NEXT_PUBLIC_*` are base/site URLs.

---

## 2. Responsiveness & mobile

### High

- **No `viewport` export.** `app/[locale]/layout.tsx` (confirmed none
  repo-wide). Without `width=device-width, initial-scale=1`, mobile renders at
  ~980px and zooms out — the fluid `clamp()` typography and `dvh` layouts
  effectively break, and double-tap-zoom fights game taps. **Fix:**
  `export const viewport: Viewport = { width: "device-width", initialScale: 1 }`.
- **Game canvas lacks `touch-action`/scroll-lock.** `game-canvas.module.scss:3`.
  Hold-to-sprint / tap-to-change-lane will trigger page scroll, text selection,
  and long-press menus on mobile. **Fix:** `touch-action: none; user-select:
  none; overscroll-behavior: contain;` on `.canvas`.

### Medium

- **Race-finish banner can overflow.** `race-finish-banner.module.scss:21`
  (`white-space: nowrap` + centered, narrow canvas) — longer Spanish strings
  clip/spill. **Fix:** allow wrapping or shrink font on small widths.
- **Match-waiting row grid rigid < ~320px.** `match-waiting.module.scss:54`
  (fixed rank + name columns squeeze the `1fr` progress track). **Fix:** a
  `@include mobile` rule shrinking/collapsing the rank or status column.

### Low

- Navbar never collapses (no hamburger) — cramped tap targets at ~320px
  (`navbar.module.scss`); consider an icon-only Leaderboard on mobile.
- `game-header` back-key is 40×40px (`game-header.module.scss:21`) — under the
  44px touch-target guideline.

### Handled well
`styles/_media-mixins.scss` breakpoints; fluid `clamp()` type; `overflow-x:
hidden` + `100dvh` sticky footer; Phaser `Scale.RESIZE` + `CENTER_BOTH` with a
portrait `3/4` aspect; touch controls + `pointer: coarse` legend; leaderboard
table `overflow-x: auto` + column hiding; `prefers-reduced-motion` honored
(banner, confetti, chips).

---

## 3. Consistency (game ↔ docs ↔ pages ↔ i18n)

i18n key parity (en ↔ es, 329 keys each) and routing are **clean** — no missing
referenced keys, no broken nav targets, no unreachable pages. All findings are
docs/copy vs code drift, mostly stale "8-lane" leftovers from the 4-lane reduction.

### High

- **"8-lane" track in user-facing copy (both locales).** _(✅ Fixed 2026-06-15.)_
  `howToPlay.intro` (en/es) said 8 lanes / 8 carriles and the ARCHITECTURE
  diagram showed "up to 8 … Player H"; the game is `LANES = 4`. Now reads 4 /
  Player D.

### Medium

- **ARCHITECTURE §4.1 discovery example is wrong** (`docs/ARCHITECTURE.md:113-136`
  vs `lib/multiplayer/events.ts:45-62,150`): doc shows a prefixed `d` tag, a
  `players` tag, and a `#status` lobby filter — code uses the **bare** matchId,
  emits **no** `players` tag, and filters status **client-side**.
- **GAME-DESIGN lists a "Space" sprint key** (`docs/GAME-DESIGN.md:43`) that
  isn't bound — only ↑/W/touch sprint (`race-scene.ts:301,610`). (The
  how-to-play page is correct; the doc is wrong.)
- **ARCHITECTURE diagram still says "up to 8" players** (`:27,29,303`); real cap
  is 4 (`MAX_PLAYERS = LANES`).
- **Junk-food halo documented as red** (`GAME-DESIGN.md:181`); code is purple
  `0xb44ce0` (`config.ts:127`).

### Low

- MULTIPLAYER.md elides lane names "Sprinter 1 … Bitcoin 4" — actual lanes are
  Sprinter / female / T-Rex / Bitcoin (`characters.ts`). Cosmetic.
- **Dead `POINTS.goodFood`/`junkFood`** (`config.ts:79-80`) — never referenced;
  real per-food points live in `foods.ts`. Documented as "fallback," but the
  numbers are misleading.
- Dead i18n keys (`common.cancel/close`, `errors.notFound`, `landing.subtitle`,
  `play.change/start`, `play.controls.touchRestart`, `play.results.title`) and
  an unused component (`components/ui/back-button/back-button.tsx`).

---

## 4. Tests

CI runs `lint`, `typecheck`, `test:unit`. The **integration job is gated on
`TEST_DATABASE_URL`** and stays green when unset — so DB-backed tests almost
certainly **don't run in CI**, and `tests/integration/store.test.ts` is skipped.
The unit suite is high quality (real in-memory transport + signers for the match
client; behavior-focused reducer/discovery tests).

### High

- **`app/api/matches/route.ts` is untested** — 401/422/403/200/502 paths. Add a
  route test mocking `getSession` + `persistMatchResult`.
- **`getLeaderboard` `max(points)` personal-best aggregation + wins ordering** is
  only verified in the **skipped** integration test. Wire `TEST_DATABASE_URL` in
  CI, or add a mocked-DB unit test.
- **`armFinishGrace` timeout firing** (straggler/disconnect → DNF resolve) is
  never exercised. Add a fake-timers test past `finishGraceUntil`.

### Medium

- `leave()` `left`-presence announce (and skip when finished/no seat) — untested.
- `lib/lightning/zap.ts` error codes + min/max clamp + comment truncation —
  only pure URL helpers are tested.
- `start()` backstops — `MIN_PLAYERS` refusal and no-restart-past-`waiting` —
  untested.
- `getResultsForPubkey` / `getLeaderboardCount` (pagination) — no coverage.

### Low

- `lib/hooks/use-match.ts` lifecycle (leave→close-transport ordering) — needs
  jsdom (not configured).
- `lib/game/rng.ts` determinism — untested.
- Component tests (waiting screen, results, practice wiring) — out of scope for
  the node-only setup.

---

## Suggested remediation roadmap

1. **Bound + validate `FinalStandingSchema`** (points/position, consistent
   1..N) — kills the cheapest leaderboard forgery. _Critical, small._
2. **Add rate limiting** to `/api/matches` and the relay-fanout auth/sync routes.
3. **Add the `viewport` export** + `touch-action: none` on the game canvas.
4. **Fix the "8-lane" → 4 copy** (both locales) and the other docs drift.
5. **Close the test gaps**: route test for `/api/matches`, a non-DB-gated
   leaderboard aggregation test (or wire `TEST_DATABASE_URL` in CI), grace-timeout
   firing, `leave()` announce.
6. **CSP/security headers** + a NIP-98 nonce store.
7. **Polish**: banner/waiting mobile rules, navbar mobile, dead code/keys, the
   minor doc mismatches.

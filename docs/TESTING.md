# 🧪 Automated tests — Bit by Bit Run

How the test suite is organized, how to run it, and what it covers. The runner is
[Vitest](https://vitest.dev) (v4); tests are TypeScript and live under
[`tests/`](../tests).

## TL;DR

```bash
npm test               # run the whole suite once (vitest run)
npm run test:watch     # watch mode while developing
npm run test:unit      # only tests/unit  — pure logic, no DB, runs anywhere
npm run test:integration  # only tests/integration — needs a test database
```

There are **24 unit test files** (180+ cases) plus an **integration suite** that
runs against a Neon test branch. The suite covers the backend and the game's core
logic — see [Coverage](#coverage) below.

## Layout

```
tests/
├── unit/             # pure logic — no network, no DB; safe to run anywhere
│   ├── lib/…         # auth, nostr, schemas, multiplayer, game, lightning…
│   ├── app/api/…     # route handlers (matches)
│   └── db/…          # Drizzle schema shape
├── integration/      # hits a real Neon test branch
│   ├── store.test.ts # persistence path: route → store → leaderboard
│   └── setup.ts      # cleanDb() — TRUNCATEs match tables before each test
└── stubs/
    └── server-only.ts  # no-op replacement for the `server-only` guard
```

### Configuration ([`vitest.config.ts`](../vitest.config.ts))

- **`environment: "node"`** — server modules (db, Lightning clients) run on their
  native code path, exactly as they do in production.
- **`fileParallelism: false`** — files run one at a time. The integration suite
  shares a single Neon test branch and each file `TRUNCATE`s the tables in
  `beforeEach`, so concurrent files would wipe each other's rows.
- **`@` alias** → repo root; **`server-only`** → a no-op stub, because that
  package throws on import outside Next.js and in Vitest we _are_ the server.
- **Coverage** is collected over `app/api/**` and `lib/**`.

## What the unit suite covers

| Area               | Files (`tests/unit/…`)                                                         | What's verified                                                                |
| ------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| **Nostr & auth**   | `lib/nostr/{signers,http-auth,nonce-store,verify,create-account,nip46-login}`, `lib/auth` | NIP-98 signed-HTTP validation, header parsing, single-use nonce replay protection, event verification, NIP-46 reload auto-restore, JWT session |
| **Schemas**        | `lib/schemas/{match,primitives}`                                               | Zod validation / bounds for wire payloads at the trust boundary               |
| **Multiplayer**    | `lib/multiplayer/{store,match-client,match-state,discovery,persist-result,create-join}` | Create/join a race end to end (lobby browser ↔ match), roster/state machine, match discovery, result persistence with retry |
| **Game logic**     | `lib/game/{track,race-net,remote-runners}`                                     | Seeded track generation, frame encode/decode, rival interpolation             |
| **Lightning**      | `lib/lightning/zap`                                                            | Zap amount/invoice handling                                                    |
| **API & infra**    | `app/api/matches`, `lib/rate-limit`, `lib/env`, `lib/creator/users`, `db/schema` | Route handlers, rate limiting, env parsing, user helpers, schema shape         |

Unit tests set and clear their own `process.env`, so **no database or secrets
are needed** — they run anywhere, including CI without secrets.

## Integration tests

`tests/integration/store.test.ts` exercises the **real persistence path**
(`persistMatchResult` → `getLeaderboard` / `getMatchResults`) against a Neon
**test branch** — never production.

- Requires `DATABASE_URL` (and `AUTH_SECRET`). With `.env.test` loaded, migrate
  the test DB first, then run:
  ```bash
  npm run test:db:migrate    # MIGRATE_ENV_FILE=.env.test tsx scripts/migrate.ts
  npm run test:integration
  ```
- Each test calls `cleanDb()` (`setup.ts`), which `TRUNCATE … RESTART IDENTITY
  CASCADE`s `results` + `matches` (leaving `users`) for a deterministic slate.
- The suite is wrapped in `describe.skipIf(!HAS_DB)`, and the script passes
  `--passWithNoTests`, so with no `DATABASE_URL` it **skips silently** instead of
  failing — the unit suite still runs everywhere.

## CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml))

On every push to `main` and every pull request, four jobs run in parallel:

| Job               | Command              | Needs secrets?                         |
| ----------------- | -------------------- | -------------------------------------- |
| Lint              | `npm run lint`       | no                                     |
| Typecheck         | `npm run typecheck`  | no                                     |
| Unit tests        | `npm run test:unit`  | no                                     |
| Integration tests | `npm run test:integration` | only if `TEST_DATABASE_URL` is set |

The integration job maps `TEST_`-prefixed secrets onto the names the app reads,
so it only ever touches the **test** DB. When `TEST_DATABASE_URL` is unset it
prints a skip notice and stays green. In-progress runs for the same branch/PR
are cancelled when a new commit lands.

## Coverage

The suite exercises the backend and the game's core logic, end to end where it
matters:

- **Nostr auth** — NIP-98 signed-HTTP requests, NIP-46 reload restore, single-use
  nonce replay protection, event verification, and JWT sessions.
- **Wire-payload validation** — every inbound match payload is checked against its
  Zod schema and bounds at the trust boundary.
- **Create / join a race** — a host creates a race, it surfaces in the lobby
  browser, a second player joins it, both rosters converge, and the host starts
  the race for everyone — driven through the real discovery aggregator, no network.
- **Multiplayer engine** — the match state machine, discovery, anti-cheat
  plausibility bounds, the finish-grace resolution, and runner-frame encoding.
- **Game logic** — seeded track generation (same course for every player) and
  rival interpolation.
- **Leaderboard & persistence** — standings aggregation and the real
  `route → store → leaderboard` path against a Neon test branch.
- **Lightning** — zap amount/invoice handling.
- **API & infra** — route handlers, rate limiting, env parsing, and schema shape.

> When you add a feature with non-trivial logic, add a unit test next to its
> module under `tests/unit/`.

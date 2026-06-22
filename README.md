# 🏃 Bit by Bit Run

> A free, web-based multiplayer **runner race** where what you eat decides who
> wins — and the champion gets paid in Bitcoin. ⚡

Four runners line up on an athletics track and sprint for the finish. Fuel up at
the stations along the way, but choose wisely: good food keeps your pace, while
**junk sends you straight back to the start**. First across the line wins — and
rivals can **zap** the winner real sats over Lightning.

The twist under the hood: **there's no game server**. Real-time multiplayer runs
entirely over public **Nostr relays**, and you sign in with your **Nostr**
identity — no email, no password.

## 🌱 Mission

Bit by Bit Run is fun first — the learning rides along for free. The same race
you're playing to win quietly builds **healthier eating instincts**, teaches
**Bitcoin & Lightning by doing**, and sharpens your eye for **crypto scams**
through a playful "scam museum" of fake ads where the only thing you can lose is
a click. Learning through play, one bit at a time.

→ Read the full [`docs/MISSION.md`](docs/MISSION.md).

## 🧱 Stack

- **App:** Next.js 16 (App Router, Turbopack) — deployed free on Vercel
- **Game engine:** [Phaser](https://phaser.io) — fake-2.5D via sprite scaling
- **Styling:** SCSS modules + a CSS-variable token system
- **i18n:** `next-intl` (Spanish default, English) with `[locale]` routing
- **Theme:** `next-themes` light/dark via `data-theme`
- **Realtime multiplayer:** Nostr ephemeral events as the transport (no server)
- **Auth:** Nostr login (NIP-07)
- **Database:** Neon (serverless Postgres) + Drizzle ORM
- **Payments:** zap the winner via their Lightning address (WebLN)

## 🚀 Quick start

```bash
npm install
npm run dev      # http://localhost:3000  (ES default; /en for English)
```

Open **`/play`** to jump into the prototype.

> 🧭 **New here, or judging?** Follow the [Guided Tour](docs/TOUR.md) to try every
> feature in ~10 minutes.

Common scripts:

```bash
npm run build            # production build
npm run lint             # ESLint
npm run typecheck        # tsc --noEmit
npm test                 # full vitest suite
npm run test:unit        # unit tests only
npm run test:integration # integration tests (needs a test database)
npm run db:migrate       # apply Drizzle migrations
```

Copy `.env.example` to `.env.local` and fill in the values before running
anything that touches the database or auth.

## 💸 Cost: $0

Everything runs on free tiers — Vercel (hosting), public Nostr relays
(realtime), and Neon (database). No always-on server is required. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for why.

## 📚 Documentation

- [`docs/MISSION.md`](docs/MISSION.md) — why this exists: learning through play
- [`docs/TOUR.md`](docs/TOUR.md) — guided tour: try every feature in ~10 minutes
- [`docs/GAME-DESIGN.md`](docs/GAME-DESIGN.md) — rules, mechanics, screens
- [`docs/MULTIPLAYER.md`](docs/MULTIPLAYER.md) — live race flow & local two-player testing
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how it works, free & serverless
- [`docs/AUTH.md`](docs/AUTH.md) — the Nostr login flow
- [`docs/CHARACTERS.md`](docs/CHARACTERS.md) — the character/sprite pipeline
- [`docs/TESTING.md`](docs/TESTING.md) — automated tests & CI
- [`CHANGELOG.md`](CHANGELOG.md) — release notes (per version)

## 👯 Sister projects

- **[`bitbybit-cursats`](https://github.com/bitbybit-ar/bitbybit-cursats)** —
  sibling project in the same family.
- **[`bitbybit-arena`](https://github.com/bitbybit-ar/bitbybit-arena)** —
    public Nostr challenges with badges and zaps.
- **[`bitbybit-habits`](https://github.com/bitbybit-ar/bitbybit-habits)** —
  habit tracker with Lightning rewards.

## 📄 License

MIT — see [`LICENSE`](LICENSE).

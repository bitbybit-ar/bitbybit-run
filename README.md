# 🏃 Bit by Bit Run

> A free, lightweight, web-based multiplayer **runner race**.

Up to **4 runners** line up on an athletics track and sprint for the finish
line. Fuel up at the stations along the way to keep your pace — but choose
wisely, because not everything on the track is good for you. First across the
line wins, and the winner can get **zapped** ⚡ in sats.

The whole game runs **for free, with no game server**: real-time multiplayer is
powered by **Nostr relays**, and persistent data lives in a serverless
**Postgres** database. Sign in with your **Nostr** identity — no email, no
password.

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

- [`docs/GAME-DESIGN.md`](docs/GAME-DESIGN.md) — rules, mechanics, screens
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how it works, free & serverless
- [`docs/AUTH.md`](docs/AUTH.md) — the Nostr login flow
- [`docs/CHARACTERS.md`](docs/CHARACTERS.md) — the character/sprite pipeline
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

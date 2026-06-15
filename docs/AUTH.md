# 🔐 Authentication (Nostr login)

Ported from the sibling **bitbybit-cursats** project (its most complete login).
Players sign in with their **Nostr** identity — no email/password.

## Connection methods (`/sign-in`)

All four are client-side and produce a `SignerHandle` (`lib/nostr/signers.ts`):

- **Browser extension** (NIP-07) — Alby, nos2x, Nostr WoT, etc.
- **Nostr Connect / NIP-46** — scan a `nostrconnect://` **QR** or paste a
  `bunker://` URL (works with **Amber**, nsec.app, Primal…).
- **nsec** — paste a raw private key (with a risk warning; not recommended).
- **Create new identity** — generate a fresh keypair in one click.

## How a sign-in works

1. The chosen signer produces a pubkey and can sign events.
2. The client builds a **NIP-98** auth event (kind 27235) with `bbr_signer` and
   `bbr_locale` tags and signs it.
3. `POST /api/auth/nostr` validates the event (`lib/nostr/verify.ts` +
   `http-auth.ts`), fetches the kind:0 profile, **upserts the `users` row**
   (`lib/creator/users.ts`), and sets a **JWT session cookie** (`lib/auth.ts`,
   via `jose`). Payload: `{ pubkey, locale, signer_type }`.
4. `GET /api/auth/session` returns the session (+ slim user) for the client;
   `POST /api/auth/signout` clears the cookie.

The in-memory signer + session state are owned by `SignerContext`
(`lib/contexts/signer-context.tsx`), mounted in the locale layout via
`SignerProviderClient`. The navbar is signer-aware (Login ↔ account + sign out).

## Setup (required to complete a login)

```bash
cp .env.example .env            # then fill DATABASE_URL (Neon) + AUTH_SECRET
npm run db:migrate              # creates the users table
```

- **`DATABASE_URL`** — Neon Postgres. Without it the page still renders and the
  signers connect, but the final upsert/session can't complete.
- **`AUTH_SECRET`** — JWT key (`openssl rand -base64 32`). Dev has a fallback.

The `users` table (Drizzle, `lib/db/schema.ts`) was trimmed from cursats to the
auth-relevant columns: `id, pubkey, slug, display_name, bio, avatar_url,
banner_url, locale, active, created_at, updated_at`.

## Tests

`npm test` (vitest) — 55 tests covering NIP-98 validation, the HTTP-auth header
parser, key/identity creation, JWT session, schemas, and the users helpers.

## Notes

- i18n strings live under the `login` / `reSignIn` / `errors` namespaces.

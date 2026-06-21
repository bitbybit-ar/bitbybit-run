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

## Session lifetime (rolling 7-day window)

The JWT cookie lasts **`SESSION_TTL_DAYS` = 7 days** (`lib/auth-constants.ts`).
It's a **rolling window**, not a fixed lifetime: `proxy.ts` (the edge
middleware) re-mints the cookie with a fresh 7-day clock on every page
navigation, verifying + re-signing the JWT with the edge-safe helpers in
`lib/session-jwt.ts`. So an active user effectively never gets logged out, while
an abandoned session lapses a week after the last visit.

A week (not an hour) is deliberate: a long match — including waiting in the
lobby for opponents — can never outlive the session and strand the player.

## Signer persistence across reloads

The session cookie outlives the **in-memory** `SignerHandle`, so on reload
`SignerContext` tries to re-attach a signer before falling back to the reconnect
prompt (`signerLoading` gates the play surface so a logged-in user isn't briefly
treated as signed-out):

- **Extension (NIP-07)** — the key lives in the extension; we re-read the pubkey
  from `window.nostr` and rebuild the handle.
- **NIP-46 (Amber, nsec.app…)** — the remote-signer **pointer**
  (`{ relays, pubkey, secret }`, _not_ a private key) is persisted to
  `localStorage` at login (`persistBunkerPointer`) and the bunker connection is
  rebuilt silently after a reload (`restoreNip46Signer`) using the reused client
  key, which the remote signer recognises. Cleared on sign-out
  (`clearBunkerPointer`). Falls back to the reconnect prompt if the bunker is
  unreachable or the restored identity doesn't match the session. While the
  signer is live, `makeNip46Signer` keeps the relay tunnel warm with a periodic
  `ping` (public relays drop idle connections) and **reconnects-and-retries
  once** if a signature fails — so a tunnel that went cold during a long lobby
  wait recovers without bouncing the player.
- **nsec** — the raw key is intentionally never persisted, so an nsec user must
  re-attach after a reload.

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

`npm test` (vitest) — NIP-98 validation, the HTTP-auth header parser,
key/identity creation, JWT session (incl. the 7-day rolling TTL), the NIP-46
reload auto-restore (`nip46-login.test.ts`), schemas, and the users helpers.

## Notes

- i18n strings live under the `login` / `reSignIn` / `errors` namespaces.

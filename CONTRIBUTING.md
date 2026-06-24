# Contributing

> **Status:** Active
> **Last updated:** 2026-06-06

---

## Table of Contents

1. [Before you start](#before-you-start)
2. [Local development](#local-development)
3. [Making changes](#making-changes)
4. [Commit messages](#commit-messages)
5. [Pull requests](#pull-requests)
6. [Code of conduct](#code-of-conduct)
7. [Reporting a vulnerability](#reporting-a-vulnerability)
8. [Open source license](#open-source-license)

---

## Before you start

- Open an issue describing the change before sending a PR for
  anything larger than a typo. Alignment first, code second.
- Read the [project README](README.md) for setup and the stack.
- Start from the [docs index](docs/README.md). Read
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) to understand how the
  game runs with no game server (Next.js + Phaser, Nostr relays as the
  realtime transport, Neon Postgres, Lightning zaps).
- Before proposing changes that touch the Nostr event/transport
  design, the match flow, the database schema, or the auth flow, read
  the relevant doc first — [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md),
  [`docs/GAME-DESIGN.md`](docs/GAME-DESIGN.md), and
  [`docs/AUTH.md`](docs/AUTH.md).

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev      # http://localhost:3000  (ES default; /en for English)
```

Fill in `.env.local` before running anything that touches the database
or auth. See [`docs/AUTH.md`](docs/AUTH.md) for the env wiring.

## Making changes

- Translate every user-facing string in both
  [`messages/es.json`](messages/es.json) and
  [`messages/en.json`](messages/en.json). No hardcoded copy in
  components — Spanish is the default locale.
- Use the existing design tokens in `styles/` (`_theme.scss`,
  `_colors.scss`, `_spacing.scss`, `_typography.scss`). If you need a
  new token, add it to the relevant map; never hardcode a hex or a
  magic spacing value.
- One `<h1>` per page.
- Add or update tests under `tests/` for behavioral changes. Run
  `npm run test:unit` (and `npm run test:integration` if you touched
  anything DB-backed).
- For any doc you add or remove, update the
  [docs index](docs/README.md). Record notable changes — product- or
  docs-visible — in the root [`CHANGELOG.md`](CHANGELOG.md), under `[Unreleased]`.

## Commit messages

- Imperative mood: "Add lobby ready-check", not "Added the ready
  check".
- One concern per commit. Refactors and feature work do not share a
  commit.
- Write commit messages and code/docs in English.

## Pull requests

- Reference the issue.
- Describe the user-visible change in the PR body.
- Before pushing, confirm there are no errors locally:

  ```bash
  npm run lint
  npm run typecheck
  npm run build
  npm test
  ```

  CI runs the same checks (lint / typecheck / unit / integration) on
  every PR.

## Code of conduct

We are a small group building together. The bar is simple:
**be kind, be honest, be useful**.

### Expected behavior

- Treat others with respect, regardless of experience, identity, or
  background.
- Assume good faith. If something reads wrong, ask before assuming.
- Disagree with ideas, not with people.
- Credit others' work when you build on it.

### Unacceptable behavior

- Harassment, insults, or personal attacks.
- Discrimination or exclusion based on identity.
- Sharing others' private information without consent.
- Sustained disruption of discussion.

### Enforcement

Report concerns to the project maintainers via GitHub or directly to a
team member. Reports stay confidential. Maintainers may warn, mute, or
ban contributors who break this code.

### Scope of conduct

This applies in all project spaces — issues, PRs, commits, chats — and
when representing the project in public.

## Reporting a vulnerability

If you find a security issue:

1. **Do not open a public GitHub issue.**
2. Open a private security advisory on the repository, or contact the
   maintainers via the information on <https://github.com/bitbybit-ar>.
3. Include enough detail to reproduce: URL, steps, expected vs actual
   behavior, and your environment.

We aim to acknowledge reports within 72 hours and to ship a fix or
mitigation within a reasonable window depending on severity.

### Security scope

In scope:

- The BitByBit RUN source code in this repository.
- The default deployment at `run.bitbybit.com.ar`.

Out of scope:

- Findings against third-party services we link to (Nostr relays,
  Lightning wallets, hosting).
- Theoretical issues with no demonstrated impact.

### Security hardening

- HTTPS-only via Vercel.
- Auth is Nostr-based (NIP-07 / NIP-46) — no passwords are ever stored.
  The session is a JWT signed with `AUTH_SECRET`, which is required in
  production.
- The session cookie uses the `__Host-` prefix in production (Secure,
  `Path=/`, no `Domain`), blocking subdomain cookie injection from any
  `*.bitbybit.com.ar` service. Sessions use a rolling 7-day window,
  refreshed on activity (see [`docs/AUTH.md`](docs/AUTH.md)).
- Secrets (`AUTH_SECRET`, the `DATABASE_URL` Postgres connection
  string) live in environment variables and never reach the client;
  server-only modules are kept out of client bundles.
- All external links open in a new tab with `rel="noopener noreferrer"`.
- **Security response headers** on every response (`next.config.ts`): a
  Content-Security-Policy (`frame-ancestors 'none'`, `object-src 'none'`,
  `base-uri 'self'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  a `Referrer-Policy`, and a `Permissions-Policy`. The CSP is kept to
  framing/plugin/base directives only (no `connect-src`) so the many origins the
  app talks to — Nostr relays over `wss:`, arbitrary avatar/LNURL hosts over
  `https:` — keep working.
- **NIP-98 login is single-use** (durable `auth_nonces` table) and the realtime
  layer rejects spoofed frames + non-host race starts (see
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §4.5).

## Open source license

By contributing you agree your contributions are licensed under the
project's open-source license ([MIT](LICENSE)).

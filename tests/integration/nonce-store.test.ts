// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { claimNonce } from "@/lib/nostr/nonce-store";
import { cleanNonces } from "./setup";

/**
 * Exercises the durable NIP-98 anti-replay guard against the real Neon test
 * branch (the `auth_nonces` table + `ON CONFLICT DO NOTHING` semantics).
 * Skipped when no DATABASE_URL is configured so the unit suite still runs
 * anywhere; run with `.env.test` loaded.
 */
const HAS_DB = !!process.env.DATABASE_URL;

// A fixed base time well inside the timestamp range (the store stamps
// `expires_at = now + TTL`); the unit suite mocks the DB, this hits Postgres.
const NOW = 1_700_000_000_000;

describe.skipIf(!HAS_DB)("nonce-store (integration)", () => {
  beforeEach(async () => {
    await cleanNonces();
  });

  it("honors an id once, then rejects a replay", async () => {
    const id = "a".repeat(64);
    expect(await claimNonce(id, NOW)).toBe(true); // first use → row inserted
    expect(await claimNonce(id, NOW + 1_000)).toBe(false); // replay → conflict
  });

  it("tracks distinct ids independently", async () => {
    expect(await claimNonce("b".repeat(64), NOW)).toBe(true);
    expect(await claimNonce("c".repeat(64), NOW)).toBe(true);
  });

  it("sweeps expired rows, so an id past its TTL is free again", async () => {
    const id = "d".repeat(64);
    expect(await claimNonce(id, NOW)).toBe(true);
    // TTL is 60s; a claim well past it deletes the expired row first, so the
    // same id can be inserted again. (In production the NIP-98 ±10s freshness
    // check rejects such a late replay upstream — this just proves the store
    // self-cleans rather than growing forever.)
    expect(await claimNonce(id, NOW + 120_000)).toBe(true);
  });
});

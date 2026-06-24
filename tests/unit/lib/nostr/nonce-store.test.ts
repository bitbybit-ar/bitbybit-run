// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit coverage for the durable (Postgres-backed) NIP-98 anti-replay guard.
 * We stub `@/lib/db` with an in-memory stand-in for the `auth_nonces` table so
 * the insert/`onConflictDoNothing`/`returning` contract is exercised without a
 * database (the real SQL is covered by the DB-gated integration suite).
 */

// In-memory stand-in for the auth_nonces table: id → expiry (ms).
const rows = new Map<string, number>();
let deleteCalls = 0;

vi.mock("@/lib/db", () => {
  const db = {
    // delete(table).where(cond) — we can't read the drizzle condition, so the
    // test drives expiry directly via the exported helper below; here we just
    // record that the sweep was issued.
    delete: () => ({
      where: () => {
        deleteCalls += 1;
        return Promise.resolve([]);
      },
    }),
    // insert(table).values(v).onConflictDoNothing().returning() — first write
    // of an id returns a row; a repeat returns [] (conflict did nothing).
    insert: () => {
      let pending: { id: string; expires_at: Date } | null = null;
      const builder = {
        values: (v: { id: string; expires_at: Date }) => {
          pending = v;
          return builder;
        },
        onConflictDoNothing: () => builder,
        returning: () => {
          const { id, expires_at } = pending!;
          if (rows.has(id)) return Promise.resolve([]); // replay
          rows.set(id, expires_at.getTime());
          return Promise.resolve([{ id }]);
        },
      };
      return builder;
    },
  };
  return { getDb: () => db, authNonces: {} };
});

import { claimNonce } from "@/lib/nostr/nonce-store";

beforeEach(() => {
  rows.clear();
  deleteCalls = 0;
});

describe("claimNonce (NIP-98 anti-replay, durable)", () => {
  it("honors an id once, then rejects a replay", async () => {
    const id = "e".repeat(64);
    expect(await claimNonce(id, 1_000_000)).toBe(true); // first use
    expect(await claimNonce(id, 1_000_100)).toBe(false); // replay
  });

  it("tracks distinct ids independently", async () => {
    expect(await claimNonce("a".repeat(64), 3_000_000)).toBe(true);
    expect(await claimNonce("b".repeat(64), 3_000_000)).toBe(true);
  });

  it("sweeps expired rows before each claim", async () => {
    await claimNonce("c".repeat(64), 4_000_000);
    expect(deleteCalls).toBe(1);
  });
});

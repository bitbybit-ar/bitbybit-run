// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import {
  persistMatchResult,
  getLeaderboard,
  getMatchResults,
} from "@/lib/multiplayer/store";
import { cleanDb } from "./setup";

/**
 * Exercises the real persistence path (route → store → leaderboard) against
 * the Neon test branch. Skipped when no DATABASE_URL is configured so the unit
 * suite still runs anywhere; run with `.env.test` loaded.
 */
const HAS_DB = !!process.env.DATABASE_URL;

const A = "a".repeat(64);
const B = "b".repeat(64);

describe.skipIf(!HAS_DB)("store persistence (integration)", () => {
  beforeEach(async () => {
    await cleanDb();
  });

  it("persists standings and aggregates them into the leaderboard", async () => {
    await persistMatchResult({
      nostrId: "bbr-int-1",
      trackId: "classic-v1",
      hostPubkey: A,
      standings: [
        { pubkey: A, position: 1, points: 520, finishTime: 100 },
        { pubkey: B, position: 2, points: 510, finishTime: 200 },
      ],
    });

    const lb = await getLeaderboard();
    const a = lb.find((r) => r.pubkey === A)!;
    const b = lb.find((r) => r.pubkey === B)!;

    expect(a.wins).toBe(1);
    expect(a.races).toBe(1);
    expect(a.bestPoints).toBe(520);
    expect(b.wins).toBe(0);
    expect(b.races).toBe(1);
    expect(lb[0].pubkey).toBe(A); // ordered by wins desc
  });

  it("is idempotent on nostr_id — re-submitting doesn't duplicate", async () => {
    const payload = {
      nostrId: "bbr-int-2",
      trackId: "classic-v1",
      hostPubkey: A,
      standings: [{ pubkey: A, position: 1, points: 500, finishTime: 100 }],
    };

    const id1 = await persistMatchResult(payload);
    const id2 = await persistMatchResult(payload); // retry
    expect(id2).toBe(id1);

    const lb = await getLeaderboard();
    expect(lb.find((r) => r.pubkey === A)!.races).toBe(1); // not 2
    expect(await getMatchResults(id1)).toHaveLength(1);
  });

  it("counts wins across matches but keeps each player's personal best", async () => {
    await persistMatchResult({
      nostrId: "bbr-int-3a",
      trackId: "classic-v1",
      hostPubkey: A,
      standings: [
        { pubkey: A, position: 1, points: 500, finishTime: 100 },
        { pubkey: B, position: 2, points: 480, finishTime: 200 },
      ],
    });
    await persistMatchResult({
      nostrId: "bbr-int-3b",
      trackId: "classic-v1",
      hostPubkey: B,
      standings: [
        { pubkey: B, position: 1, points: 530, finishTime: 90 },
        { pubkey: A, position: 2, points: 470, finishTime: 160 },
      ],
    });

    const lb = await getLeaderboard();
    const a = lb.find((r) => r.pubkey === A)!;
    const b = lb.find((r) => r.pubkey === B)!;
    expect(a.races).toBe(2);
    expect(b.races).toBe(2);
    expect(a.wins).toBe(1);
    expect(b.wins).toBe(1);
    // bestPoints is the max of a player's matches, not the sum.
    expect(a.bestPoints).toBe(500); // max(500, 470)
    expect(b.bestPoints).toBe(530); // max(480, 530)
    // Wins tie → ordered by personal best, so B (530) ranks above A (500).
    expect(lb[0].pubkey).toBe(B);
  });
});

// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

/**
 * Unit coverage for the leaderboard query that runs in CI without a database
 * (the full SQL is exercised by the DB-gated integration test). We stub the
 * Drizzle query builder so we can assert (a) the HTTP driver's string counts
 * are normalized to numbers, and (b) every sort key builds and runs.
 */

// Canned rows as the Neon HTTP driver returns them: count/max come back as
// *strings*, which `getLeaderboard` must coerce.
const RAW_ROWS = [
  {
    pubkey: "a".repeat(64),
    wins: "2",
    bestPoints: "530",
    races: "3",
    display_name: "Ann",
    avatar_url: null,
  },
];

const orderByCalls: unknown[][] = [];

vi.mock("@/lib/db", () => {
  // A chainable, thenable stub: every builder method returns the stub, and
  // awaiting it resolves to the canned rows (Drizzle query builders are
  // thenable the same way).
  const qb: Record<string, unknown> = {};
  for (const m of [
    "select",
    "from",
    "leftJoin",
    "groupBy",
    "limit",
    "offset",
  ]) {
    qb[m] = () => qb;
  }
  qb.orderBy = (...args: unknown[]) => {
    orderByCalls.push(args);
    return qb;
  };
  qb.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(RAW_ROWS).then(resolve);
  return { getDb: () => qb };
});

import { getLeaderboard, LEADERBOARD_SORTS } from "@/lib/multiplayer/store";

describe("getLeaderboard", () => {
  it("coerces the driver's string counts to numbers", async () => {
    const [row] = await getLeaderboard();
    expect(row.wins).toBe(2);
    expect(row.bestPoints).toBe(530);
    expect(row.races).toBe(3);
    expect(typeof row.wins).toBe("number");
    expect(row.display_name).toBe("Ann");
  });

  it("builds and runs an ordering for every supported sort", async () => {
    orderByCalls.length = 0;
    for (const sort of LEADERBOARD_SORTS) {
      await expect(getLeaderboard({ sort })).resolves.toHaveLength(1);
    }
    // One orderBy per sort, each with three tiebreaker terms.
    expect(orderByCalls).toHaveLength(LEADERBOARD_SORTS.length);
    for (const call of orderByCalls) expect(call).toHaveLength(3);
  });
});

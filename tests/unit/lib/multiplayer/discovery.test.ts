// @vitest-environment node
import { describe, it, expect } from "vitest";
import { LANES } from "@/lib/game/config";
import type { MatchDiscovery } from "@/lib/schemas/match";
import {
  addPresence,
  selectOpenMatches,
  FRESH_WINDOW_MS,
  type DiscoveryState,
} from "@/lib/multiplayer/discovery";

const A = "a".repeat(64);
const B = "b".repeat(64);
const NOW = 1_700_000_000_000;

function presence(over: Partial<MatchDiscovery> = {}): MatchDiscovery {
  return {
    matchId: "m1",
    trackId: "classic-v1",
    host: A,
    pubkey: A,
    lane: 0,
    name: "Ann",
    status: "waiting",
    createdAt: NOW,
    ...over,
  };
}

function build(...ps: MatchDiscovery[]): DiscoveryState {
  return ps.reduce((s, p) => addPresence(s, p), {} as DiscoveryState);
}

describe("discovery addPresence", () => {
  it("aggregates seats per match and keeps the newest per pubkey", () => {
    const s = build(
      presence({ pubkey: A, host: A, createdAt: NOW }),
      presence({ pubkey: B, host: A, name: "Bea", createdAt: NOW + 10 }),
      presence({ pubkey: A, host: A, lane: 2, createdAt: NOW + 20 }) // A re-claims
    );
    expect(Object.keys(s.m1)).toHaveLength(2);
    expect(s.m1[A].createdAt).toBe(NOW + 20);
  });

  it("ignores an older presence for the same pubkey", () => {
    const s0 = build(presence({ createdAt: NOW + 100 }));
    const s1 = addPresence(s0, presence({ createdAt: NOW + 50 }));
    expect(s1).toBe(s0); // unchanged reference
  });
});

describe("discovery selectOpenMatches", () => {
  it("surfaces a joinable match with host name and player count", () => {
    const s = build(
      presence({ pubkey: A, host: A, name: "Ann" }),
      presence({ pubkey: B, host: A, name: "Bea" })
    );
    const [m] = selectOpenMatches(s, NOW + 1000);
    expect(m.matchId).toBe("m1");
    expect(m.host).toBe(A);
    expect(m.hostName).toBe("Ann");
    expect(m.players).toBe(2);
  });

  it("surfaces the host-supplied race name, taken from the host seat", () => {
    const s = build(
      presence({ pubkey: A, host: A, name: "Ann", raceName: "Friday Cup" }),
      presence({ pubkey: B, host: A, name: "Bea" }) // joiner carries no raceName
    );
    const [m] = selectOpenMatches(s, NOW + 1000);
    expect(m.raceName).toBe("Friday Cup");
  });

  it("leaves raceName undefined when the host didn't name the race", () => {
    const s = build(
      presence({ pubkey: A, host: A }),
      presence({ pubkey: B, host: A })
    );
    expect(selectOpenMatches(s, NOW + 1000)[0].raceName).toBeUndefined();
  });

  it("hides full matches", () => {
    const seats = Array.from({ length: LANES }, (_, i) =>
      presence({ pubkey: String(i).repeat(64), host: A, lane: i })
    );
    expect(selectOpenMatches(build(...seats), NOW)).toHaveLength(0);
  });

  it("hides matches that already started (any seat not waiting)", () => {
    const s = build(
      presence({ pubkey: A, host: A, status: "playing" }),
      presence({ pubkey: B, host: A, status: "waiting" })
    );
    expect(selectOpenMatches(s, NOW + 1000)).toHaveLength(0);
  });

  it("hides stale matches past the freshness window", () => {
    const s = build(presence({ createdAt: NOW }));
    expect(selectOpenMatches(s, NOW + FRESH_WINDOW_MS + 1)).toHaveLength(0);
    expect(selectOpenMatches(s, NOW + 1000)).toHaveLength(1);
  });

  it("orders matches by most recently active", () => {
    const s = build(
      presence({ matchId: "old", pubkey: A, createdAt: NOW }),
      presence({ matchId: "new", pubkey: B, createdAt: NOW + 5000 })
    );
    expect(selectOpenMatches(s, NOW + 6000).map((m) => m.matchId)).toEqual([
      "new",
      "old",
    ]);
  });
});

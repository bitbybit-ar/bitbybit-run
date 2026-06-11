// @vitest-environment node
import { describe, it, expect } from "vitest";
import { LANES, MAX_RUNNER_SPEED } from "@/lib/game/config";
import {
  MatchControlSchema,
  MatchDiscoverySchema,
  MatchFinishSchema,
  PersistMatchSchema,
  RunnerStateSchema,
} from "@/lib/schemas/match";
import {
  KIND,
  T_TAG,
  buildRunnerEvent,
  lobbyFilter,
  matchFilter,
  parseEvent,
} from "@/lib/multiplayer/events";
import type { NostrEvent } from "@/lib/nostr/types";

const PK = "a".repeat(64);

/** Wrap an unsigned event with dummy id/pubkey/sig (parseEvent ignores them). */
function asNostrEvent(unsigned: {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}): NostrEvent {
  return { ...unsigned, id: "f".repeat(64), pubkey: PK, sig: "0".repeat(128) };
}

const validRunner = {
  pubkey: PK,
  progress: 0.5,
  lane: 0,
  speed: 180,
  energy: 0.4,
  poison: 0.1,
  status: "running" as const,
  points: 30,
  t: 1700000000000,
};

describe("schemas/match RunnerStateSchema", () => {
  it("accepts a well-formed runner state", () => {
    expect(RunnerStateSchema.safeParse(validRunner).success).toBe(true);
  });

  it("rejects a lane outside the track", () => {
    expect(
      RunnerStateSchema.safeParse({ ...validRunner, lane: LANES }).success
    ).toBe(false);
  });

  it("rejects out-of-range unit values", () => {
    expect(
      RunnerStateSchema.safeParse({ ...validRunner, progress: 1.5 }).success
    ).toBe(false);
    expect(
      RunnerStateSchema.safeParse({ ...validRunner, energy: -0.1 }).success
    ).toBe(false);
  });

  it("rejects an unknown status", () => {
    expect(
      RunnerStateSchema.safeParse({ ...validRunner, status: "napping" }).success
    ).toBe(false);
  });

  it("rejects a faster-than-possible speed (anti-cheat bound)", () => {
    expect(
      RunnerStateSchema.safeParse({ ...validRunner, speed: MAX_RUNNER_SPEED })
        .success
    ).toBe(true);
    expect(
      RunnerStateSchema.safeParse({
        ...validRunner,
        speed: MAX_RUNNER_SPEED + 1,
      }).success
    ).toBe(false);
  });
});

describe("schemas/match MatchDiscoverySchema (self-presence)", () => {
  const base = {
    matchId: "m1",
    trackId: "classic-v1",
    host: PK,
    pubkey: PK,
    lane: 0,
    name: "Ann",
    createdAt: 1700000000,
  };

  it("accepts a well-formed presence", () => {
    expect(MatchDiscoverySchema.safeParse(base).success).toBe(true);
  });

  it("accepts a presence without a name", () => {
    const { name: _name, ...noName } = base;
    expect(MatchDiscoverySchema.safeParse(noName).success).toBe(true);
  });

  it("rejects a lane outside the track", () => {
    expect(
      MatchDiscoverySchema.safeParse({ ...base, lane: LANES }).success
    ).toBe(false);
  });
});

describe("schemas/match control + finish", () => {
  it("control requires the literal start type", () => {
    const ok = {
      type: "start",
      matchId: "m1",
      trackId: "classic-v1",
      startAt: 1700000000000,
    };
    expect(MatchControlSchema.safeParse(ok).success).toBe(true);
    expect(MatchControlSchema.safeParse({ ...ok, type: "stop" }).success).toBe(
      false
    );
  });

  it("finish requires a positive position", () => {
    const ok = { pubkey: PK, finishTime: 1, position: 1, points: 500 };
    expect(MatchFinishSchema.safeParse(ok).success).toBe(true);
    expect(MatchFinishSchema.safeParse({ ...ok, position: 0 }).success).toBe(
      false
    );
  });
});

describe("schemas/match PersistMatchSchema", () => {
  const base = {
    nostrId: "bbr-abc123-1700000000000",
    trackId: "classic-v1",
    host: PK,
    startedAt: 1700000000000,
    standings: [
      { pubkey: PK, position: 1, points: 520, finishTime: 100 },
      { pubkey: "c".repeat(64), position: 2, points: 510, finishTime: null },
    ],
  };

  it("accepts a well-formed persist body", () => {
    expect(PersistMatchSchema.safeParse(base).success).toBe(true);
  });

  it("requires at least one standing", () => {
    expect(
      PersistMatchSchema.safeParse({ ...base, standings: [] }).success
    ).toBe(false);
  });

  it("rejects more standings than lanes", () => {
    const standings = Array.from({ length: LANES + 1 }, (_, i) => ({
      pubkey: PK,
      position: i + 1,
      points: 0,
      finishTime: null,
    }));
    expect(PersistMatchSchema.safeParse({ ...base, standings }).success).toBe(
      false
    );
  });

  it("allows a null finishTime (DNF) but rejects a bad pubkey", () => {
    expect(
      PersistMatchSchema.safeParse({
        ...base,
        standings: [
          { pubkey: "xyz", position: 1, points: 0, finishTime: null },
        ],
      }).success
    ).toBe(false);
  });
});

describe("multiplayer/events round-trip + parse", () => {
  it("builds a runner event that parses back to the payload", () => {
    const event = asNostrEvent(buildRunnerEvent("m1", validRunner));
    expect(event.kind).toBe(KIND.RUNNER);
    const parsed = parseEvent(event);
    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe("runner");
    if (parsed?.type === "runner") expect(parsed.data).toEqual(validRunner);
  });

  it("returns null on malformed JSON", () => {
    const event = asNostrEvent({
      kind: KIND.RUNNER,
      created_at: 0,
      tags: [],
      content: "{not json",
    });
    expect(parseEvent(event)).toBeNull();
  });

  it("returns null on a schema mismatch", () => {
    const event = asNostrEvent({
      kind: KIND.RUNNER,
      created_at: 0,
      tags: [],
      content: JSON.stringify({ ...validRunner, lane: 99 }),
    });
    expect(parseEvent(event)).toBeNull();
  });

  it("returns null on an unknown kind", () => {
    const event = asNostrEvent({
      kind: 1,
      created_at: 0,
      tags: [],
      content: JSON.stringify(validRunner),
    });
    expect(parseEvent(event)).toBeNull();
  });
});

describe("multiplayer/events filters", () => {
  it("lobby filter targets discovery events by project tag", () => {
    const f = lobbyFilter();
    expect(f.kinds).toEqual([KIND.DISCOVERY]);
    expect(f["#t"]).toEqual([T_TAG]);
  });

  it("match filter targets the realtime kinds scoped to the match id", () => {
    const f = matchFilter("m1", 123);
    expect(f.kinds).toEqual([
      KIND.DISCOVERY,
      KIND.CONTROL,
      KIND.RUNNER,
      KIND.FINISH,
    ]);
    expect(f["#d"]).toEqual(["m1"]);
    expect(f.since).toBe(123);
  });
});

// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { ParsedEvent } from "@/lib/multiplayer/events";
import {
  applyEvent,
  beginPlaying,
  createMatchState,
  isComplete,
  resolveStandings,
} from "@/lib/multiplayer/match-state";
import type { RunnerState } from "@/lib/multiplayer/types";
import { POINTS } from "@/lib/game/config";

const A = "a".repeat(64);
const B = "b".repeat(64);

function runner(pubkey: string, over: Partial<RunnerState> = {}): RunnerState {
  return {
    pubkey,
    progress: 0,
    lane: 0,
    speed: 180,
    energy: 0.5,
    poison: 0,
    status: "running",
    points: 0,
    t: 1,
    ...over,
  };
}

function base() {
  return createMatchState({
    matchId: "m1",
    trackId: "classic-v1",
    players: [
      { pubkey: A, lane: 0 },
      { pubkey: B, lane: 1 },
    ],
  });
}

describe("match-state createMatchState", () => {
  it("starts waiting with empty live state", () => {
    const s = base();
    expect(s.status).toBe("waiting");
    expect(s.startAt).toBeNull();
    expect(s.runners).toEqual({});
    expect(s.finishes).toEqual({});
    expect(s.players).toHaveLength(2);
  });
});

function presence(
  pubkey: string,
  lane: number,
  over: Partial<{ matchId: string; host: string; name: string }> = {}
): ParsedEvent {
  return {
    type: "discovery",
    data: {
      matchId: over.matchId ?? "m1",
      host: over.host ?? A,
      trackId: "classic-v1",
      pubkey,
      lane,
      name: over.name,
      status: "waiting",
      createdAt: 1,
    },
  };
}

describe("match-state discovery (self-presence aggregation)", () => {
  it("aggregates each peer's seat into the roster, sorted by lane", () => {
    let s = createMatchState({ matchId: "m1", trackId: "classic-v1" });
    s = applyEvent(s, presence(B, 1, { name: "Bea" }));
    s = applyEvent(s, presence(A, 0, { name: "Ann" }));
    expect(s.players.map((p) => p.pubkey)).toEqual([A, B]); // lane order
    expect(s.players[0]).toMatchObject({ pubkey: A, lane: 0, name: "Ann" });
    expect(s.host).toBe(A);
  });

  it("upserts a peer's own seat (re-claim updates, doesn't duplicate)", () => {
    let s = createMatchState({ matchId: "m1", trackId: "classic-v1" });
    s = applyEvent(s, presence(A, 0));
    s = applyEvent(s, presence(A, 3)); // A moves lanes
    expect(s.players).toHaveLength(1);
    expect(s.players[0].lane).toBe(3);
  });

  it("ignores discovery for a different match", () => {
    const before = base();
    expect(applyEvent(before, presence(A, 0, { matchId: "other" }))).toBe(
      before
    );
  });
});

/** A presence event with an explicit claim time, for lane-conflict tests. */
function claim(pubkey: string, lane: number, createdAt: number): ParsedEvent {
  return {
    type: "discovery",
    data: {
      matchId: "m1",
      host: A,
      trackId: "classic-v1",
      pubkey,
      lane,
      status: "waiting",
      createdAt,
    },
  };
}

describe("match-state lane conflict (one runner per lane)", () => {
  it("keeps the earlier claim when two peers grab the same lane", () => {
    let s = createMatchState({ matchId: "m1", trackId: "classic-v1" });
    s = applyEvent(s, claim(A, 2, 100)); // A claims lane 2 first
    s = applyEvent(s, claim(B, 2, 200)); // B claims lane 2 later → loses
    expect(s.players).toHaveLength(1);
    expect(s.players[0]).toMatchObject({ pubkey: A, lane: 2 });
  });

  it("evicts the later claimant even if it arrives first", () => {
    let s = createMatchState({ matchId: "m1", trackId: "classic-v1" });
    s = applyEvent(s, claim(B, 2, 200)); // B (later claim) seen first
    s = applyEvent(s, claim(A, 2, 100)); // A claimed earlier → wins the lane
    expect(s.players).toHaveLength(1);
    expect(s.players[0]).toMatchObject({ pubkey: A, lane: 2 });
  });

  it("breaks an exact tie by lexicographic pubkey, deterministically", () => {
    let s = createMatchState({ matchId: "m1", trackId: "classic-v1" });
    s = applyEvent(s, claim(B, 2, 100));
    s = applyEvent(s, claim(A, 2, 100)); // same time → smaller pubkey (A) wins
    expect(s.players).toHaveLength(1);
    expect(s.players[0].pubkey).toBe(A);
  });
});

describe("match-state control + countdown", () => {
  it("moves waiting → countdown and records startAt", () => {
    const event: ParsedEvent = {
      type: "control",
      data: {
        type: "start",
        matchId: "m1",
        trackId: "classic-v1",
        startAt: 999,
      },
    };
    const s = applyEvent(base(), event);
    expect(s.status).toBe("countdown");
    expect(s.startAt).toBe(999);
  });

  it("beginPlaying only advances from countdown", () => {
    const waiting = base();
    expect(beginPlaying(waiting)).toBe(waiting);
    const countdown = { ...waiting, status: "countdown" as const, startAt: 1 };
    expect(beginPlaying(countdown).status).toBe("playing");
  });
});

function runnerEvent(pubkey: string, over: Partial<RunnerState> = {}): ParsedEvent {
  return { type: "runner", data: runner(pubkey, over), signer: pubkey };
}

function finishEvent(
  pubkey: string,
  over: Partial<{ finishTime: number; position: number; points: number }> = {}
): ParsedEvent {
  return {
    type: "finish",
    data: {
      pubkey,
      finishTime: over.finishTime ?? 100,
      position: over.position ?? 1,
      points: over.points ?? 500,
    },
    signer: pubkey,
  };
}

describe("match-state runner merge", () => {
  it("keeps the newest frame per pubkey and drops stale ones", () => {
    let s = base();
    s = applyEvent(s, runnerEvent(A, { t: 10, progress: 0.2 }));
    expect(s.runners[A].progress).toBeCloseTo(0.2);

    // stale (older t) → ignored, returns same reference
    const same = applyEvent(s, runnerEvent(A, { t: 5, progress: 0.9 }));
    expect(same).toBe(s);

    // newer t → applied
    s = applyEvent(s, runnerEvent(A, { t: 20, progress: 0.6 }));
    expect(s.runners[A].progress).toBeCloseTo(0.6);
  });
});

describe("match-state finish + standings", () => {
  it("finishes the race the instant the first runner crosses", () => {
    let s = base();
    // B is mid-race with more points; A crosses the line first.
    s = applyEvent(s, runnerEvent(B, { t: 1, points: 90, progress: 0.5 }));
    s = applyEvent(s, finishEvent(A, { finishTime: 100, points: 520 }));

    expect(s.status).toBe("finished"); // first crossing ends it for everyone
    // The runner who crossed wins; the rest trail (B never finished).
    expect(s.standings[0].pubkey).toBe(A);
    expect(s.standings[0].position).toBe(1);
    expect(s.standings[1].pubkey).toBe(B);
    expect(s.standings[1].finishTime).toBeNull();
  });

  it("does not let a later duplicate finish overwrite the first", () => {
    let s = base();
    s = applyEvent(s, finishEvent(A, { finishTime: 100, points: 500 }));
    const same = applyEvent(
      s,
      finishEvent(A, { finishTime: 300, position: 2, points: 999 })
    );
    expect(same).toBe(s);
  });

  it("still reports the full roster once complete", () => {
    let s = base();
    s = applyEvent(s, finishEvent(B, { finishTime: 200 }));
    s = applyEvent(s, finishEvent(A, { finishTime: 100 }));
    expect(isComplete(s)).toBe(true);
    // A finished earlier (100 < 200) → ranks first despite arriving second.
    expect(s.standings.map((r) => r.pubkey)).toEqual([A, B]);
  });
});

describe("match-state resolveStandings", () => {
  it("orders unfinished players by points behind finishers", () => {
    let s = base();
    s = applyEvent(s, runnerEvent(A, { t: 1, points: 40 }));
    s = applyEvent(s, runnerEvent(B, { t: 1, points: 90 }));
    const standings = resolveStandings(s);
    // No finishers → higher points first.
    expect(standings[0].pubkey).toBe(B);
    expect(standings[0].finishTime).toBeNull();
  });

  it("adds a placement bonus by arrival order, so position counts toward points", () => {
    let s = base();
    // Both unfinished. A is further along the track but B has more base points.
    s = applyEvent(s, runnerEvent(A, { t: 1, points: 0, progress: 0.8 }));
    s = applyEvent(s, runnerEvent(B, { t: 1, points: 200, progress: 0.2 }));
    const standings = resolveStandings(s);
    const byKey = Object.fromEntries(standings.map((r) => [r.pubkey, r]));
    // A arrives 1st (further) → +placement[0]; B arrives 2nd → +placement[1].
    expect(byKey[A].points).toBe(POINTS.placement[0]);
    expect(byKey[B].points).toBe(200 + POINTS.placement[1]);
  });
});

describe("match-state status adoption from presence", () => {
  it("advances the lifecycle forward from a peer's announced status", () => {
    let s = base();
    expect(s.status).toBe("waiting");
    // A reconnecting client learns from retained presence that it's playing.
    s = applyEvent(s, {
      type: "discovery",
      data: {
        matchId: "m1",
        host: A,
        trackId: "classic-v1",
        pubkey: A,
        lane: 0,
        status: "playing",
        createdAt: 1,
      },
    });
    expect(s.status).toBe("playing");
    // Never moves backward: a stale "waiting" presence can't un-start it.
    s = applyEvent(s, presence(B, 1));
    expect(s.status).toBe("playing");
  });
});

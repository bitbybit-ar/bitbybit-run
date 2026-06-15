// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  RemoteRunners,
  RUNNER_PALETTE,
  laneColor,
} from "@/lib/game/remote-runners";
import type { RunnerState } from "@/lib/multiplayer/types";

const A = "a".repeat(64);
const SELF = "b".repeat(64);

function runner(pubkey: string, over: Partial<RunnerState> = {}): RunnerState {
  return {
    pubkey,
    progress: 0,
    lane: 0,
    speed: 300,
    energy: 0.5,
    poison: 0,
    status: "running",
    points: 0,
    t: 1,
    ...over,
  };
}

describe("remote-runners interpolation", () => {
  it("excludes the local player", () => {
    const rr = new RemoteRunners();
    rr.ingest({ [A]: runner(A), [SELF]: runner(SELF) }, SELF, 1000);
    const views = rr.frame(1000);
    expect(views.map((v) => v.pubkey)).toEqual([A]);
  });

  it("dead-reckons a running runner forward over time, clamped to 1", () => {
    const rr = new RemoteRunners();
    rr.ingest({ [A]: runner(A, { progress: 0.2, speed: 300 }) }, SELF, 1000);
    // First frame at receive time → displays the base value.
    expect(rr.frame(1000)[0].progress).toBeCloseTo(0.2, 5);

    // Advance several frames; progress should climb toward the extrapolated
    // target and never exceed 1.
    let last = 0.2;
    for (let now = 1050; now <= 2000; now += 50) {
      const p = rr.frame(now)[0].progress;
      expect(p).toBeGreaterThanOrEqual(last - 1e-9);
      expect(p).toBeLessThanOrEqual(1);
      last = p;
    }
    expect(last).toBeGreaterThan(0.2);
  });

  it("eases a finished runner toward the finish line", () => {
    const rr = new RemoteRunners();
    rr.ingest(
      { [A]: runner(A, { progress: 0.8, status: "finished" }) },
      SELF,
      1000
    );
    let p = 0;
    for (let now = 1000; now <= 2000; now += 50) p = rr.frame(now)[0].progress;
    expect(p).toBeGreaterThan(0.95);
  });

  it("ignores stale samples (older sender timestamp)", () => {
    const rr = new RemoteRunners();
    rr.ingest(
      { [A]: runner(A, { t: 5, progress: 0.5, speed: 0 }) },
      SELF,
      1000
    );
    // settle near 0.5
    for (let now = 1000; now <= 1500; now += 50) rr.frame(now);
    // a stale, lower-progress sample must not rewind the runner
    rr.ingest(
      { [A]: runner(A, { t: 2, progress: 0.05, speed: 0 }) },
      SELF,
      1500
    );
    const p = rr.frame(1550)[0].progress;
    expect(p).toBeGreaterThan(0.4);
  });

  it("colors runners by their roster lane", () => {
    const rr = new RemoteRunners();
    rr.ingest({ [A]: runner(A, { lane: 0 }) }, SELF, 1000);
    const view = rr.frame(1000, [{ pubkey: A, lane: 2, name: "Ann" }])[0];
    expect(view.name).toBe("Ann");
    expect(view.color).toBe(RUNNER_PALETTE[2]);
  });

  it("exposes the claimed (roster) lane as seatLane, not the live lane", () => {
    const rr = new RemoteRunners();
    // Runner is mid-race in lane 0, but claimed lane 2 in the lobby — the
    // character must follow the claimed lane so it doesn't flip as they swerve.
    rr.ingest({ [A]: runner(A, { lane: 0 }) }, SELF, 1000);
    const view = rr.frame(1000, [{ pubkey: A, lane: 2, name: "Ann" }])[0];
    expect(view.seatLane).toBe(2);
    expect(view.lane).toBe(0); // live lane unaffected (drives position)
  });

  it("falls back to the live lane for seatLane when no roster seat is known", () => {
    const rr = new RemoteRunners();
    rr.ingest({ [A]: runner(A, { lane: 3 }) }, SELF, 1000);
    expect(rr.frame(1000)[0].seatLane).toBe(3);
  });
});

describe("remote-runners laneColor", () => {
  it("wraps lane indices into the palette", () => {
    expect(laneColor(0)).toBe(RUNNER_PALETTE[0]);
    expect(laneColor(RUNNER_PALETTE.length)).toBe(RUNNER_PALETTE[0]);
    expect(laneColor(-1)).toBe(RUNNER_PALETTE[RUNNER_PALETTE.length - 1]);
  });
});

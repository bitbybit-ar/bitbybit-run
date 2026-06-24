// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildTrack, TRACK } from "@/lib/game/track";
import { LANES } from "@/lib/game/config";

describe("buildTrack (seeded per-match layout)", () => {
  it("is deterministic — same seed → identical track", () => {
    const a = buildTrack("match-abc");
    const b = buildTrack("match-abc");
    expect(a).toEqual(b);
  });

  it("gives different matches different layouts", () => {
    const a = buildTrack("match-abc");
    const b = buildTrack("match-xyz");
    // Food positions should differ across seeds (not the same fixed track).
    const posA = a.goodFood
      .map((f) => `${f.lane}:${Math.round(f.at)}`)
      .join(",");
    const posB = b.goodFood
      .map((f) => `${f.lane}:${Math.round(f.at)}`)
      .join(",");
    expect(posA).not.toBe(posB);
  });

  it("keeps every booster gauntlet dodgeable (two junk-free lanes)", () => {
    for (const seed of ["a", "b", "c", "match-1", "match-2"]) {
      const track = buildTrack(seed);
      for (const boost of track.boosters) {
        const junkLanes = new Set(
          track.junkFood.filter((j) => j.at === boost.at).map((j) => j.lane)
        );
        // The booster's own lane is always clean.
        expect(junkLanes.has(boost.lane)).toBe(false);
        // At least two lanes are junk-free at the zone (booster + escape).
        const cleanLanes = Array.from({ length: LANES }, (_, l) => l).filter(
          (l) => !junkLanes.has(l)
        );
        expect(cleanLanes.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("keeps the track length constant and well-populated", () => {
    const track = buildTrack("wall-check");
    expect(track.length).toBe(TRACK.length);
    expect(track.goodFood.length).toBeGreaterThan(0);
    expect(track.junkFood.length).toBeGreaterThan(0);
    expect(track.boosters.length).toBeGreaterThan(0);
    // All food sits within the track bounds.
    for (const f of [...track.goodFood, ...track.junkFood, ...track.boosters]) {
      expect(f.at).toBeGreaterThanOrEqual(0);
      expect(f.at).toBeLessThan(track.length);
      expect(f.lane).toBeGreaterThanOrEqual(0);
      expect(f.lane).toBeLessThan(LANES);
    }
  });
});

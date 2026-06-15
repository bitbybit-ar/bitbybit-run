/**
 * Smooth rendering of *other* players' runners.
 *
 * Remote state arrives at ~5 Hz (kind 21000) but we render at 60 Hz, so a
 * raw plot would stutter. Two tricks keep ghosts/minimap fluid:
 *   1. dead-reckoning — between samples, advance a runner by its last known
 *      speed (capped, so a runner who stops sending doesn't drift forever);
 *   2. easing — the displayed value chases the (extrapolated) target instead
 *      of snapping, so corrections when a fresh sample lands are invisible.
 *
 * Extrapolation is measured from the *local* receive time, never the sender's
 * `t`, so clock skew between players can't throw positions off. Pure logic,
 * no Phaser — unit-tested in isolation.
 */
import { TRACK } from "./track";
import type {
  MatchPlayer,
  RunnerState,
  RunnerStatus,
} from "@/lib/multiplayer/types";

/** Ghost/minimap colors, indexed by lane (one per lane on the 4-lane track). */
export const RUNNER_PALETTE = [
  0x4ade80, // green
  0x60a5fa, // blue
  0xf472b6, // pink
  0xfcd34d, // amber
] as const;

export function laneColor(lane: number): number {
  const n = RUNNER_PALETTE.length;
  return RUNNER_PALETTE[((lane % n) + n) % n];
}

export interface RemoteRunnerView {
  pubkey: string;
  progress: number; // 0..1, smoothed for display
  lane: number; // fractional, smoothed for display
  /** The lane this runner *claimed* in the lobby — stable for the whole race,
   *  so it identifies their character. Distinct from `lane`, which is the live
   *  racing lane they may swerve across mid-race. */
  seatLane: number;
  status: RunnerStatus;
  name?: string;
  color: number;
}

/** Cap on dead-reckoning so a silent runner stops advancing after this. */
const EXTRAPOLATE_MS = 600;
/** Display smoothing rate (higher = snappier chase toward the target). */
const EASE = 9;

interface Entry {
  lastT: number; // sender stamp of the current base sample
  baseProgress: number;
  baseLane: number;
  speed: number; // track-units/sec, for dead-reckoning
  status: RunnerStatus;
  recvMono: number; // local time the base sample was received
  dispProgress: number; // last displayed value
  dispLane: number;
  lastFrameMono: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class RemoteRunners {
  private readonly entries = new Map<string, Entry>();

  /**
   * Fold the latest per-pubkey runner states in (skipping our own). Older
   * samples (by sender `t`) are ignored so out-of-order delivery can't rewind
   * a runner.
   */
  ingest(
    runners: Record<string, RunnerState>,
    selfPubkey: string,
    nowMono: number
  ): void {
    for (const [pubkey, s] of Object.entries(runners)) {
      if (pubkey === selfPubkey) continue;
      const prev = this.entries.get(pubkey);
      if (prev && prev.lastT >= s.t) continue; // not newer → keep current base
      this.entries.set(pubkey, {
        lastT: s.t,
        baseProgress: s.progress,
        baseLane: s.lane,
        speed: s.speed,
        status: s.status,
        recvMono: nowMono,
        dispProgress: prev?.dispProgress ?? s.progress,
        dispLane: prev?.dispLane ?? s.lane,
        lastFrameMono: prev?.lastFrameMono ?? nowMono,
      });
    }
  }

  /**
   * Produce smoothed views for this frame. `players` (the lobby roster)
   * supplies a stable lane/name/color; falls back to the runner's own lane.
   */
  frame(nowMono: number, players: MatchPlayer[] = []): RemoteRunnerView[] {
    const roster = new Map(players.map((p) => [p.pubkey, p]));
    const views: RemoteRunnerView[] = [];

    for (const [pubkey, e] of this.entries) {
      // Dead-reckon a target from the base sample (capped window).
      const elapsed =
        Math.min(EXTRAPOLATE_MS, Math.max(0, nowMono - e.recvMono)) / 1000;
      let target = e.baseProgress;
      if (e.status === "running") {
        target = clamp01(e.baseProgress + (e.speed * elapsed) / TRACK.length);
      } else if (e.status === "finished") {
        target = 1;
      }

      // Ease the displayed value toward the target.
      const dt = Math.max(0, nowMono - e.lastFrameMono) / 1000;
      const k = Math.min(1, dt * EASE);
      e.dispProgress += (target - e.dispProgress) * k;
      e.dispLane += (e.baseLane - e.dispLane) * k;
      e.lastFrameMono = nowMono;

      const seat = roster.get(pubkey);
      const seatLane = seat?.lane ?? Math.round(e.baseLane);
      views.push({
        pubkey,
        progress: e.dispProgress,
        lane: e.dispLane,
        seatLane,
        status: e.status,
        name: seat?.name,
        color: laneColor(seatLane),
      });
    }

    return views;
  }

  clear(): void {
    this.entries.clear();
  }
}

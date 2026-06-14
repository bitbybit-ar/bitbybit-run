/**
 * Domain types for a multiplayer race. These describe the *local view* a
 * client holds of a match — the roster, every runner's latest state, and
 * the resolved standings — as opposed to the wire payloads in
 * `lib/schemas/match.ts`. The snapshot is what the UI (lobby, minimap,
 * results) renders and what the state machine returns.
 */
import { LANES } from "@/lib/game/config";
import type {
  MatchFinish,
  MatchPlayer,
  RunnerState,
  RunnerStatus,
} from "@/lib/schemas/match";

export type { MatchFinish, MatchPlayer, RunnerState, RunnerStatus };

/** One runner per lane → the lane count is the player cap. */
export const MAX_PLAYERS = LANES;

/** A real match needs rivals — below this, the host should practice solo. */
export const MIN_PLAYERS = 2;

/**
 * Lifecycle of a match from a client's point of view:
 *   waiting   — lobby open, roster filling
 *   countdown — host pressed start, racing soon (`startAt`)
 *   playing   — clock has reached `startAt`
 *   finished  — every roster player has crossed the line
 */
export type MatchStatus = "waiting" | "countdown" | "playing" | "finished";

/** A resolved placement, ready to persist. */
export interface FinalStanding {
  pubkey: string;
  position: number; // 1-based
  points: number;
  /** Unix ms, or null for a player who never finished. */
  finishTime: number | null;
}

/**
 * The full local view of a match. Pure data — produced by the reducer in
 * `match-state.ts`, consumed by the UI and the persistence layer.
 */
export interface MatchSnapshot {
  matchId: string;
  trackId: string;
  /** Host pubkey, or "" until a discovery event names one. */
  host: string;
  status: MatchStatus;
  /** Unix ms the race starts; null until a control event arrives. */
  startAt: number | null;
  /** Lobby roster (host-authoritative, from discovery events). */
  players: MatchPlayer[];
  /** Latest runner state per pubkey (newest wins, by `t`). */
  runners: Record<string, RunnerState>;
  /** Finish record per pubkey, as finishers cross the line. */
  finishes: Record<string, MatchFinish>;
  /** Ordered placements; recomputed whenever a finish lands. */
  standings: FinalStanding[];
}

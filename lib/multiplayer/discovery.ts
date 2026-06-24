/**
 * Lobby discovery — aggregate the self-presence events (kind 30078, `#t`
 * project tag) floating on the relays into a list of open matches to join.
 *
 * Each peer announces its own seat, so a match is the set of presences sharing
 * a `matchId`; we keep the newest presence per pubkey, drop full and stale
 * matches, and surface the rest. Pure (no transport/React) so it's unit-tested;
 * the `useMatchDiscovery` hook feeds relay events through `addPresence` and
 * renders `selectOpenMatches`.
 */
import type { MatchDiscovery, MatchLobbyStatus } from "@/lib/schemas/match";
import { MAX_PLAYERS } from "./types";

/** A joinable match surfaced in the lobby browser. */
export interface OpenMatch {
  matchId: string;
  host: string;
  hostName?: string;
  /** Optional label the host gave the race (helps players find a match). */
  raceName?: string;
  trackId: string;
  players: number;
  /** Newest presence timestamp in the match (unix ms). */
  updatedAt: number;
}

interface Seat {
  name?: string;
  host: string;
  trackId: string;
  status: MatchLobbyStatus;
  createdAt: number;
  /** Only the host's presence carries this. */
  raceName?: string;
}

/** matchId → (pubkey → latest seat). */
export type DiscoveryState = Record<string, Record<string, Seat>>;

/** Stop showing a match with no presence newer than this (10 min). */
export const FRESH_WINDOW_MS = 10 * 60 * 1000;

/** Fold a presence event in, keeping the newest seat per pubkey. */
export function addPresence(
  state: DiscoveryState,
  p: MatchDiscovery
): DiscoveryState {
  const seats = state[p.matchId] ?? {};
  const prev = seats[p.pubkey];
  if (prev && prev.createdAt >= p.createdAt) return state; // not newer
  return {
    ...state,
    [p.matchId]: {
      ...seats,
      [p.pubkey]: {
        name: p.name,
        host: p.host,
        trackId: p.trackId,
        status: p.status,
        createdAt: p.createdAt,
        raceName: p.raceName,
      },
    },
  };
}

/**
 * Derive the joinable matches: non-empty, not full, with a recent presence —
 * newest first.
 */
export function selectOpenMatches(
  state: DiscoveryState,
  now: number
): OpenMatch[] {
  const matches: OpenMatch[] = [];

  for (const [matchId, seats] of Object.entries(state)) {
    const entries = Object.values(seats);
    if (entries.length === 0 || entries.length >= MAX_PLAYERS) continue;

    // Hide matches that already left the lobby (host started / finished).
    if (entries.some((s) => s.status !== "waiting")) continue;

    const updatedAt = Math.max(...entries.map((s) => s.createdAt));
    if (now - updatedAt > FRESH_WINDOW_MS) continue; // stale / abandoned

    // The host is the peer whose own presence names itself as host (every seat
    // echoes the same host pubkey, but reading it from the host's own seat is
    // robust to a joiner's presence arriving first or echoing a stale value).
    const host =
      Object.keys(seats).find((pk) => seats[pk]!.host === pk) ??
      entries[0].host;
    const hostSeat = seats[host];
    matches.push({
      matchId,
      host,
      hostName: hostSeat?.name,
      raceName: hostSeat?.raceName,
      trackId: hostSeat?.trackId ?? entries[0].trackId,
      players: entries.length,
      updatedAt,
    });
  }

  return matches.sort((a, b) => b.updatedAt - a.updatedAt);
}

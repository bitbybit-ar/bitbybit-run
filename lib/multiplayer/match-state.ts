/**
 * Pure match state machine.
 *
 * Given a snapshot and a parsed inbound event, return the next snapshot —
 * no I/O, no clock, no Phaser. This is the heart of the multiplayer
 * contract and the easiest piece to test exhaustively. The orchestrator
 * (`match-client.ts`) owns timers and transport; this file owns the rules:
 *   - the roster aggregates each peer's self-presence (no server to own it):
 *     every discovery event upserts that author's seat, keyed by pubkey
 *   - runner frames merge newest-wins (stale frames are dropped)
 *   - the winner is the *earliest* finishTime, recomputed locally — we
 *     never trust a remote event's claimed `position` (see ARCHITECTURE §4.4)
 */
import { POINTS } from "@/lib/game/config";
import type { ParsedEvent } from "./events";
import {
  FINISH_GRACE_MS,
  type FinalStanding,
  type MatchSnapshot,
  type MatchStatus,
} from "./types";

/** Lifecycle ordering — the match status only ever advances along this. */
const STATUS_ORDER: Record<MatchStatus, number> = {
  waiting: 0,
  countdown: 1,
  playing: 2,
  finished: 3,
};

/** The later of two lifecycle statuses (never moves backward). */
function maxStatus(a: MatchStatus, b: MatchStatus): MatchStatus {
  return STATUS_ORDER[b] > STATUS_ORDER[a] ? b : a;
}

export interface CreateMatchInput {
  matchId: string;
  trackId: string;
  host?: string;
  players?: MatchSnapshot["players"];
  status?: MatchSnapshot["status"];
}

export function createMatchState(input: CreateMatchInput): MatchSnapshot {
  return {
    matchId: input.matchId,
    trackId: input.trackId,
    host: input.host ?? "",
    status: input.status ?? "waiting",
    startAt: null,
    players: input.players ?? [],
    runners: {},
    finishes: {},
    standings: [],
    finishGraceUntil: null,
  };
}

/**
 * Resolve current placements. The race ends the instant the *first* runner
 * crosses, so standings always cover the full roster (finishers + everyone
 * caught mid-race).
 *
 * Two passes:
 *   1. Arrival order — finishers by earliest `finishTime`, then the rest by how
 *      far they got (`progress`). This decides each seat's *placement*.
 *   2. Placement bonus — the spot you reach the line in is worth points
 *      (`POINTS.placement` by arrival index), folded into each seat's total.
 *
 * Final order: the runner who crossed first wins (earliest `finishTime` ranks
 * #1); everyone else is ordered by total points — which now includes the
 * placement bonus, so where you arrived still counts toward the ranking.
 */
export function resolveStandings(state: MatchSnapshot): FinalStanding[] {
  const ranked = state.players.map((player) => {
    const finish = state.finishes[player.pubkey];
    const runner = state.runners[player.pubkey];
    return {
      pubkey: player.pubkey,
      finishTime: finish ? finish.finishTime : null,
      basePoints: finish ? finish.points : (runner?.points ?? 0),
      progress: finish ? 1 : (runner?.progress ?? 0),
    };
  });

  // Pass 1: arrival order (finishers first by time, then by track progress).
  const arrivalOrder = [...ranked].sort((a, b) => {
    if (a.finishTime !== null && b.finishTime !== null) {
      return a.finishTime - b.finishTime;
    }
    if (a.finishTime !== null) return -1;
    if (b.finishTime !== null) return 1;
    if (b.progress !== a.progress) return b.progress - a.progress;
    return b.basePoints - a.basePoints;
  });

  // Pass 2: award the placement bonus by arrival index (clamped to last tier).
  const bonus = (index: number) =>
    POINTS.placement[Math.min(index, POINTS.placement.length - 1)] ?? 0;
  const totalPoints = new Map<string, number>();
  arrivalOrder.forEach((row, index) => {
    totalPoints.set(row.pubkey, row.basePoints + bonus(index));
  });

  const rows = ranked.map((row) => ({
    pubkey: row.pubkey,
    finishTime: row.finishTime,
    points: totalPoints.get(row.pubkey) ?? row.basePoints,
  }));

  rows.sort((a, b) => {
    if (a.finishTime !== null && b.finishTime !== null) {
      return a.finishTime - b.finishTime;
    }
    if (a.finishTime !== null) return -1; // the winner who crossed ranks first
    if (b.finishTime !== null) return 1;
    return b.points - a.points; // the rest by total points (incl. placement)
  });

  return rows.map((row, index) => ({ ...row, position: index + 1 }));
}

/** True once every roster player is done — finished, or left the match (so a
 *  departed player no longer blocks the others from seeing the results). */
export function isComplete(state: MatchSnapshot): boolean {
  return (
    state.players.length > 0 &&
    state.players.every(
      (p) => state.finishes[p.pubkey] !== undefined || p.left === true
    )
  );
}

/**
 * Flip a countdown to playing. Time-driven, so the orchestrator calls this
 * when the clock reaches `startAt` (the reducer stays clock-free).
 */
export function beginPlaying(state: MatchSnapshot): MatchSnapshot {
  if (state.status !== "countdown") return state;
  return { ...state, status: "playing" };
}

/** Shallow roster equality — same seats (pubkey/lane/name) in the same order. */
function sameRoster(a: MatchSnapshot["players"], b: MatchSnapshot["players"]) {
  if (a.length !== b.length) return false;
  return a.every((p, i) => {
    const q = b[i];
    return (
      p.pubkey === q.pubkey &&
      p.lane === q.lane &&
      p.name === q.name &&
      !!p.left === !!q.left
    );
  });
}

export function applyEvent(
  state: MatchSnapshot,
  event: ParsedEvent
): MatchSnapshot {
  switch (event.type) {
    case "discovery": {
      // Ignore discovery for a different match sharing our channel.
      if (event.data.matchId !== state.matchId) return state;
      const { pubkey, lane, name, createdAt } = event.data;

      // Drop this author's previous seat first (re-announce / lane change).
      let players = state.players.filter((p) => p.pubkey !== pubkey);

      // One runner per lane. If another peer already holds this lane, the
      // *earlier* claim wins (tie-break: lexicographically smaller pubkey) so
      // every client converges on the same winner without a server. The loser
      // simply keeps no seat and re-picks. This is what stops two players from
      // ending up on the same character when they claim before seeing each
      // other (the brief presence-propagation gap).
      const rival = players.find((p) => p.lane === lane);
      const rivalAt = rival?.claimedAt ?? 0;
      const iWin =
        !rival ||
        createdAt < rivalAt ||
        (createdAt === rivalAt && pubkey < rival.pubkey);

      if (iWin) {
        if (rival) players = players.filter((p) => p.pubkey !== rival.pubkey);
        players = [
          ...players,
          {
            pubkey,
            lane,
            name,
            claimedAt: createdAt,
            sessionKey: event.data.sessionKey,
            left: event.data.left,
          },
        ];
      }

      players = players.sort((a, b) => a.lane - b.lane);

      // Presence is replaceable (the relay retains the latest per author), so a
      // peer's announced `status` is the source of truth for the lifecycle when
      // we (re)join after the ephemeral control/finish events are long gone.
      // Adopt it forward-only — this is what lets a reconnecting client learn
      // the match already started (or finished) and stops it from restarting.
      const nextStatus = maxStatus(state.status, event.data.status);

      // No-op echo (e.g. our own heartbeat coming back) → keep the same ref so
      // the orchestrator doesn't emit a needless snapshot.
      const rosterSame = sameRoster(players, state.players);
      if (rosterSame && nextStatus === state.status) return state;
      const next: MatchSnapshot = {
        ...state,
        host: state.host || event.data.host,
        trackId: event.data.trackId,
        players: rosterSame ? state.players : players,
        status: nextStatus,
      };
      // If a player leaving mid-race means everyone remaining is done, end the
      // match now rather than making the finishers wait out the grace timeout.
      if (next.status === "playing" && isComplete(next)) {
        next.status = "finished";
        next.standings = resolveStandings(next);
      }
      return next;
    }

    case "control": {
      if (event.data.matchId !== state.matchId) return state;
      // Only the host may drive the lifecycle: the start event is signed by the
      // host's real identity, so reject one signed by anyone else. If we don't
      // yet know the host (their presence hasn't propagated), accept best-effort
      // — matching the no-authoritative-server scope (ARCHITECTURE §0).
      if (state.host && event.signer !== state.host) return state;
      // Only ever advance the lifecycle forward.
      if (state.status !== "waiting") {
        return { ...state, startAt: event.data.startAt };
      }
      return { ...state, status: "countdown", startAt: event.data.startAt };
    }

    case "runner": {
      const prev = state.runners[event.data.pubkey];
      if (prev && prev.t >= event.data.t) return state; // stale frame
      return {
        ...state,
        runners: { ...state.runners, [event.data.pubkey]: event.data },
      };
    }

    case "finish": {
      const prev = state.finishes[event.data.pubkey];
      // First finish wins for a given pubkey (a later duplicate can only be
      // slower, so keep the earliest).
      if (prev && prev.finishTime <= event.data.finishTime) return state;
      const finishes = { ...state.finishes, [event.data.pubkey]: event.data };
      // The grace deadline is anchored to the *earliest* finish, so every
      // client converges on the same countdown end without a server clock.
      const earliest = Math.min(
        ...Object.values(finishes).map((f) => f.finishTime)
      );
      const next: MatchSnapshot = {
        ...state,
        finishes,
        finishGraceUntil: earliest + FINISH_GRACE_MS,
      };
      // Everyone races their own line: the match only ends once *every* roster
      // player has crossed (or left). Until then finishers see a live waiting
      // screen while the rest keep running. The orchestrator arms a grace
      // timeout (see match-client) so a straggler/disconnect can't stall it.
      if (isComplete(next)) next.status = "finished";
      // Recompute on every finish so the waiting screen's live ranking updates
      // (finishers by time, the rest by track progress).
      next.standings = resolveStandings(next);
      return next;
    }

    default:
      return state;
  }
}

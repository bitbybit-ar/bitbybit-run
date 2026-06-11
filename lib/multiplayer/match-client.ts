/**
 * Match orchestrator — the one object the UI (and the Phaser scene) talks
 * to for a live race. It wires three collaborators together and owns the
 * things the pure reducer can't: a `Transport`, a `SignerHandle`, the
 * broadcast throttle, and the countdown timer.
 *
 *   inbound:  transport → parseEvent → applyEvent → emit snapshot
 *   outbound: announceLobby / start / broadcastRunner / finish → sign → publish
 *
 * Framework-agnostic on purpose: `lib/hooks/use-match.ts` adapts it to
 * React, but a headless Node script (or a test) can drive it the same way.
 */
import type { NostrEvent } from "@/lib/nostr/types";
import type { SignerHandle } from "@/lib/nostr/signers";
import type {
  MatchDiscovery,
  MatchFinish,
  RunnerState,
} from "@/lib/schemas/match";
import {
  buildControlEvent,
  buildDiscoveryEvent,
  buildFinishEvent,
  buildRunnerEvent,
  matchFilter,
  parseEvent,
  type ParsedEvent,
} from "./events";
import { applyEvent, beginPlaying, createMatchState } from "./match-state";
import type { Subscription, Transport } from "./transport";
import type { MatchPlayer, MatchSnapshot } from "./types";

export interface MatchClientOptions {
  transport: Transport;
  signer: SignerHandle;
  matchId: string;
  trackId: string;
  /** Match creator's pubkey. Defaults to this signer when `isHost`. */
  host?: string;
  /** Seed roster (e.g. tests); normally the roster aggregates from presence. */
  players?: MatchPlayer[];
  /** Is this client the match host (can start the race)? */
  isHost?: boolean;
  /** Runner-state broadcast rate; defaults to ~5 Hz (ARCHITECTURE §4.3). */
  broadcastHz?: number;
}

type SnapshotListener = (snapshot: MatchSnapshot) => void;

/** Re-broadcast our presence this often while the lobby is open, so the match
 *  stays fresh in the browser and late joiners reliably learn the roster. */
const PRESENCE_HEARTBEAT_MS = 5000;
/** Coalesce the "greet the newcomer" re-announce so a burst of joins → one. */
const REANNOUNCE_DEBOUNCE_MS = 400;
/**
 * Wall-clock tolerance (ms) for the timestamps on inbound runner/finish frames.
 * Stamps further in the future than this are dropped as implausible — covers
 * honest clock skew while denying a hostile peer the two time-based exploits in
 * the serverless model: a far-future runner `t` (which would pin their ghost as
 * "newest" and freeze it, since the reducer is newest-wins) and a future/past
 * `finishTime` (the winner is the *earliest* finishTime, so a stamp before the
 * race even started would falsely win). Structural/range checks (speed bound,
 * 0..1 fields) live in the Zod schemas; this is the clock-dependent half the
 * pure reducer deliberately can't own.
 */
const STAMP_SKEW_TOLERANCE_MS = 5000;

/** Runner fields the caller supplies; `pubkey` and `t` are stamped here. */
export type RunnerInput = Omit<RunnerState, "pubkey" | "t">;

export class MatchClient {
  readonly matchId: string;
  readonly trackId: string;

  private readonly transport: Transport;
  private readonly signer: SignerHandle;
  private readonly isHost: boolean;
  private readonly host: string;
  private readonly intervalMs: number;

  private state: MatchSnapshot;
  private sub: Subscription | null = null;
  private countdownTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reannounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastBroadcast = 0;
  /** This peer's claimed seat (with the claim time, kept stable across
   *  re-announces so lane-conflict tie-breaks don't drift). */
  private lastSeat: { lane: number; name?: string; createdAt: number } | null =
    null;
  /** Peers we've already greeted with a re-announce (so we do it once each). */
  private readonly seenPeers = new Set<string>();
  private readonly listeners = new Set<SnapshotListener>();

  constructor(opts: MatchClientOptions) {
    this.matchId = opts.matchId;
    this.trackId = opts.trackId;
    this.transport = opts.transport;
    this.signer = opts.signer;
    this.isHost = opts.isHost ?? false;
    this.host = opts.host ?? (this.isHost ? opts.signer.pubkey : "");
    this.intervalMs = 1000 / (opts.broadcastHz ?? 5);
    this.state = createMatchState({
      matchId: opts.matchId,
      trackId: opts.trackId,
      host: this.host,
      players: opts.players,
    });

    this.sub = this.transport.subscribe(matchFilter(this.matchId), (event) =>
      this.handleEvent(event)
    );
  }

  /** Pubkey of the local player. */
  get pubkey(): string {
    return this.signer.pubkey;
  }

  getSnapshot(): MatchSnapshot {
    return this.state;
  }

  /** Subscribe to snapshot changes; fires immediately with the current one. */
  onSnapshot(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  /**
   * Announce (or update) this peer's own seat — claiming a lane, setting a
   * name. Every client does this; the roster aggregates the presences. The
   * local state is updated optimistically so the UI doesn't wait for the echo.
   */
  async announceSelf(seat: { lane: number; name?: string }): Promise<void> {
    // Stamp the claim time once per claim; re-announces reuse it so the
    // lane-conflict tie-break (earliest claim wins) stays stable.
    this.lastSeat = { ...seat, createdAt: Date.now() };
    // Optimistic local upsert (same path as an inbound presence).
    const next = applyEvent(this.state, {
      type: "discovery",
      data: this.presencePayload(),
    });
    if (next !== this.state) {
      this.state = next;
      this.emit();
    }
    this.startHeartbeat();
    await this.publishPresence();
  }

  /** This peer's current self-presence payload, from the held seat. */
  private presencePayload(): MatchDiscovery {
    const seat = this.lastSeat!;
    return {
      matchId: this.matchId,
      trackId: this.trackId,
      host: this.host,
      pubkey: this.signer.pubkey,
      lane: seat.lane,
      name: seat.name,
      status: this.state.status,
      createdAt: seat.createdAt,
    };
  }

  /** Sign + publish the held presence (no local apply). */
  private async publishPresence(): Promise<void> {
    if (!this.lastSeat) return;
    const event = await this.signer.sign(
      buildDiscoveryEvent(this.presencePayload(), this.state.status)
    );
    await this.transport.publish(event);
  }

  /** Keep our presence fresh while the lobby is open (stops once racing). */
  private startHeartbeat(): void {
    if (this.heartbeatTimer !== null) return;
    this.heartbeatTimer = setInterval(() => {
      if (this.state.status !== "waiting" || !this.lastSeat) {
        this.stopHeartbeat();
        return;
      }
      void this.publishPresence().catch(() => {});
    }, PRESENCE_HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** Re-announce ourselves shortly (debounced) when a newcomer appears, so they
   *  learn our seat even if relays didn't replay our stored presence to them. */
  private scheduleReannounce(): void {
    if (!this.lastSeat || this.reannounceTimer !== null) return;
    this.reannounceTimer = setTimeout(() => {
      this.reannounceTimer = null;
      if (this.lastSeat && this.state.status === "waiting") {
        void this.publishPresence().catch(() => {});
      }
    }, REANNOUNCE_DEBOUNCE_MS);
  }

  /** Host-only: send the start signal with a synced `startAt`. */
  async start(countdownMs = 3000): Promise<void> {
    this.assertHost("start");
    const startAt = Date.now() + Math.max(0, countdownMs);
    const event = await this.signer.sign(
      buildControlEvent({
        type: "start",
        matchId: this.matchId,
        trackId: this.trackId,
        startAt,
      })
    );
    await this.transport.publish(event);
  }

  /**
   * Broadcast the local runner's state, throttled to the configured rate.
   * Returns false if dropped by the throttle (pass `force` to override).
   */
  async broadcastRunner(
    input: RunnerInput,
    opts?: { force?: boolean }
  ): Promise<boolean> {
    const now = Date.now();
    if (!opts?.force && now - this.lastBroadcast < this.intervalMs) {
      return false;
    }
    this.lastBroadcast = now;
    const payload: RunnerState = {
      ...input,
      pubkey: this.signer.pubkey,
      t: now,
    };
    const event = await this.signer.sign(
      buildRunnerEvent(this.matchId, payload)
    );
    await this.transport.publish(event);
    return true;
  }

  /** Announce the local runner crossing the line. */
  async finish(input: { points: number; finishTime?: number }): Promise<void> {
    const finishTime = input.finishTime ?? Date.now();
    // Tentative position from what we've seen; the reducer recomputes the
    // authoritative order from finish times, so this is only a hint.
    const position = Object.keys(this.state.finishes).length + 1;
    const payload: MatchFinish = {
      pubkey: this.signer.pubkey,
      finishTime,
      position,
      points: input.points,
    };
    const event = await this.signer.sign(
      buildFinishEvent(this.matchId, payload)
    );
    await this.transport.publish(event);
  }

  /** Stop receiving and release timers. */
  leave(): void {
    this.clearCountdown();
    this.stopHeartbeat();
    if (this.reannounceTimer !== null) {
      clearTimeout(this.reannounceTimer);
      this.reannounceTimer = null;
    }
    this.sub?.close();
    this.sub = null;
    this.listeners.clear();
  }

  // --- internals -----------------------------------------------------------

  private handleEvent(raw: NostrEvent): void {
    const parsed = parseEvent(raw);
    if (!parsed) return;
    if (!this.isPlausible(parsed)) return;

    // A newcomer announced in our match — greet them with a re-announce so they
    // learn our seat even if relays didn't replay our stored presence.
    if (
      parsed.type === "discovery" &&
      parsed.data.matchId === this.matchId &&
      parsed.data.pubkey !== this.signer.pubkey &&
      !this.seenPeers.has(parsed.data.pubkey)
    ) {
      this.seenPeers.add(parsed.data.pubkey);
      this.scheduleReannounce();
    }

    const prevStatus = this.state.status;
    let next = applyEvent(this.state, parsed);
    if (parsed.type === "control") next = this.armCountdown(next);
    if (next === this.state) return; // no-op (stale / unrelated) → no emit

    this.state = next;
    this.emit();

    // When the match leaves "waiting" (e.g. the host started), re-announce our
    // presence so the lobby browser can drop this now-started match.
    if (
      next.status !== prevStatus &&
      next.status !== "waiting" &&
      this.lastSeat
    ) {
      void this.publishPresence().catch(() => {});
    }
  }

  /**
   * Clock-dependent plausibility gate for inbound frames (anti-cheat). The Zod
   * schemas already bound the structural fields (speed, 0..1 ranges); this
   * rejects timestamps that are physically impossible given the local clock —
   * tolerant of honest skew via `STAMP_SKEW_TOLERANCE_MS`.
   *
   * Note we deliberately do NOT require runner `progress` to be monotonic: a
   * full poison bar sends the runner to the bathroom (back to the start line),
   * a legitimate rewind — see docs/MULTIPLAYER.md.
   */
  private isPlausible(parsed: ParsedEvent): boolean {
    const future = Date.now() + STAMP_SKEW_TOLERANCE_MS;
    if (parsed.type === "runner") {
      return parsed.data.t <= future;
    }
    if (parsed.type === "finish") {
      if (parsed.data.finishTime > future) return false;
      // A finish can't predate the race clock (the earliest finishTime wins, so
      // a stamp before `startAt` would be an instant, illegitimate victory).
      // Best-effort: if the start (control) event hasn't reached us yet,
      // `startAt` is still null and this check is skipped — fitting the casual,
      // no-authoritative-server scope (ARCHITECTURE §0).
      if (
        this.state.startAt !== null &&
        parsed.data.finishTime < this.state.startAt
      ) {
        return false;
      }
    }
    return true;
  }

  /** Schedule the countdown→playing flip; flips now if `startAt` has passed. */
  private armCountdown(state: MatchSnapshot): MatchSnapshot {
    if (state.status !== "countdown" || state.startAt === null) return state;
    this.clearCountdown();
    const delay = state.startAt - Date.now();
    if (delay <= 0) return beginPlaying(state);
    this.countdownTimer = setTimeout(() => {
      this.state = beginPlaying(this.state);
      this.emit();
    }, delay);
    return state;
  }

  private clearCountdown(): void {
    if (this.countdownTimer !== null) {
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private assertHost(action: string): void {
    if (!this.isHost) {
      throw new Error(`match: ${action} is host-only`);
    }
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener(this.state);
  }
}

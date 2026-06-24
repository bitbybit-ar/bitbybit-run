/**
 * Zod schemas for the multiplayer wire payloads — the JSON `content` of
 * the four Nostr event kinds that drive a match (see
 * `docs/ARCHITECTURE.md §4`). Every inbound event is parsed through these
 * before the state machine ever sees it, so a malformed or hostile event
 * from a public relay can never corrupt local state.
 *
 *   30078  discovery  (lobby roster, replaceable)   -> MatchDiscoverySchema
 *   21001  control    (start signal)                -> MatchControlSchema
 *   21000  runner     (per-player state, ~5 Hz)     -> RunnerStateSchema
 *   21002  finish     (per-player finish)           -> MatchFinishSchema
 */
import { z } from "zod";
import { NostrPubkeySchema } from "./primitives";
import {
  LANES,
  MATCH_POINTS_MAX,
  MATCH_POINTS_MIN,
  MAX_RUNNER_SPEED,
} from "@/lib/game/config";

/** Per-race score, bounded to a sane range so a forged frame/POST can't write
 *  an absurd value (anti-abuse clamp, not the gameplay cap). */
const PointsSchema = z
  .number()
  .int()
  .min(MATCH_POINTS_MIN)
  .max(MATCH_POINTS_MAX);

/** Finishing place — 1-based, never beyond the lane (player) count. */
const PositionSchema = z.number().int().min(1).max(LANES);

/** A runner's coarse state, mirrored from `RaceScene` (lib/game). */
export const RunnerStatusSchema = z.enum(["running", "bathroom", "finished"]);
export type RunnerStatus = z.infer<typeof RunnerStatusSchema>;

/** 0..1 normalized value (progress, energy, poison). */
const UnitSchema = z.number().min(0).max(1);

/** Lane index on the shared track — `0..LANES-1`. */
const LaneSchema = z
  .number()
  .int()
  .min(0)
  .max(LANES - 1);

/** Free-form ids kept short so payloads stay tiny on the wire. */
const ShortIdSchema = z.string().min(1).max(64);

/** One seat in the lobby roster. */
export const MatchPlayerSchema = z.object({
  pubkey: NostrPubkeySchema,
  lane: LaneSchema,
  name: z.string().max(80).optional(),
  /** Local-only: when this seat was claimed (presence `createdAt`, unix ms).
   *  Used to resolve two peers racing for the same lane deterministically. */
  claimedAt: z.number().int().nonnegative().optional(),
  /** Ephemeral per-match signing key this peer announced (binds their runner/
   *  finish frames to this identity without re-prompting Amber). */
  sessionKey: NostrPubkeySchema.optional(),
  /** This peer announced it left the match (closed the tab / navigated away).
   *  Lets others stop waiting on them and label them "left" instead of DNF. */
  left: z.boolean().optional(),
});
export type MatchPlayer = z.infer<typeof MatchPlayerSchema>;

/** Lobby lifecycle of a match, as advertised in presence/discovery. */
export const MatchLobbyStatusSchema = z.enum([
  "waiting",
  "countdown",
  "playing",
  "finished",
]);
export type MatchLobbyStatus = z.infer<typeof MatchLobbyStatusSchema>;

/**
 * kind 30078 content — a single peer's *self-presence* in a match.
 *
 * There's no game server to own a roster, so each player announces their own
 * seat (replaceable, keyed by author+matchId) and every client aggregates the
 * presences into the roster. `host` is the match creator's pubkey (so the UI
 * knows who may start); `pubkey`/`lane`/`name` are this peer's own seat;
 * `status` lets the lobby browser drop matches that have already started.
 */
export const MatchDiscoverySchema = z.object({
  matchId: ShortIdSchema,
  trackId: ShortIdSchema,
  host: NostrPubkeySchema,
  pubkey: NostrPubkeySchema,
  lane: LaneSchema,
  name: z.string().max(80).optional(),
  /** Optional human label the host gave the race (only the host announces it),
   *  shown in the lobby browser so players can find a specific match. */
  raceName: z.string().max(80).optional(),
  status: MatchLobbyStatusSchema.default("waiting"),
  createdAt: z.number().int().nonnegative(),
  /** Ephemeral signing key for this peer's in-match frames (runner/finish), so
   *  Amber/NIP-46 isn't prompted per frame. Bound here by the real identity
   *  that signs this presence; the binding lets clients reject spoofed frames. */
  sessionKey: NostrPubkeySchema.optional(),
  /** Announced when this peer leaves the match, so others stop waiting on them
   *  (see `MatchPlayerSchema.left`). Best-effort: a hard tab-close may not send
   *  it, which is why the finish-grace timeout still backstops the match end. */
  left: z.boolean().optional(),
});
export type MatchDiscovery = z.infer<typeof MatchDiscoverySchema>;

/** kind 21001 content — the host's "go" with a synced `startAt`. */
export const MatchControlSchema = z.object({
  type: z.literal("start"),
  matchId: ShortIdSchema,
  trackId: ShortIdSchema,
  /** Unix ms when the race begins (for a synced countdown). */
  startAt: z.number().int().nonnegative(),
});
export type MatchControl = z.infer<typeof MatchControlSchema>;

/** kind 21000 content — a single runner's live state. */
export const RunnerStateSchema = z.object({
  pubkey: NostrPubkeySchema,
  progress: UnitSchema, // 0..1 along the track
  lane: LaneSchema,
  // Bounded (not just nonnegative): a frame claiming a faster-than-possible
  // speed is dropped here, before dead-reckoning could fling the ghost. See
  // MAX_RUNNER_SPEED in lib/game/config.ts.
  speed: z.number().min(0).max(MAX_RUNNER_SPEED),
  energy: UnitSchema,
  poison: UnitSchema,
  status: RunnerStatusSchema,
  points: PointsSchema,
  /** Unix ms the sender stamped — used to drop stale frames. */
  t: z.number().int().nonnegative(),
});
export type RunnerState = z.infer<typeof RunnerStateSchema>;

/** kind 21002 content — a runner crossing the line. */
export const MatchFinishSchema = z.object({
  pubkey: NostrPubkeySchema,
  /** Unix ms of the finish — earliest wins (authoritative tiebreak). */
  finishTime: z.number().int().nonnegative(),
  position: PositionSchema,
  points: PointsSchema,
});
export type MatchFinish = z.infer<typeof MatchFinishSchema>;

/** One resolved placement, as posted to `POST /api/matches`. */
export const FinalStandingSchema = z.object({
  pubkey: NostrPubkeySchema,
  position: PositionSchema,
  points: PointsSchema,
  finishTime: z.number().int().nonnegative().nullable(),
});

/**
 * Body of `POST /api/matches` — a participant submits a finished match's
 * standings to persist for the leaderboard. `nostrId` is the idempotency key.
 * The standings must be internally consistent — one row per player (unique
 * pubkeys) occupying a contiguous `1..N` set of positions — so a forged POST
 * can't, say, claim position 1 twice or hand a rival position 99.
 */
export const PersistMatchSchema = z.object({
  nostrId: ShortIdSchema.max(80),
  trackId: ShortIdSchema,
  host: NostrPubkeySchema,
  startedAt: z.number().int().nonnegative().nullable().optional(),
  standings: z
    .array(FinalStandingSchema)
    .min(1)
    .max(LANES)
    .refine(
      (rows) => new Set(rows.map((r) => r.pubkey)).size === rows.length,
      "standings have duplicate pubkeys"
    )
    .refine((rows) => {
      const positions = rows.map((r) => r.position).sort((a, b) => a - b);
      return positions.every((p, i) => p === i + 1);
    }, "standings positions must be a contiguous 1..N set"),
});
export type PersistMatchInput = z.infer<typeof PersistMatchSchema>;

/**
 * Translation between match payloads and Nostr events.
 *
 * `build*Event` go from a typed payload to an `UnsignedNostrEvent` (the
 * caller signs it with a `SignerHandle`); `parseEvent` goes the other way,
 * validating untrusted relay events through the Zod schemas and returning
 * a discriminated union (or `null` to drop garbage). Filter builders shape
 * the relay subscriptions. Event kinds + tag layout follow
 * `docs/ARCHITECTURE.md §4`.
 */
import type { Filter } from "nostr-tools/filter";
import type { NostrEvent, UnsignedNostrEvent } from "@/lib/nostr/types";
import {
  MatchControlSchema,
  MatchDiscoverySchema,
  MatchFinishSchema,
  RunnerStateSchema,
  type MatchControl,
  type MatchDiscovery,
  type MatchFinish,
  type RunnerState,
} from "@/lib/schemas/match";
import { MAX_PLAYERS, type MatchStatus } from "./types";

export const KIND = {
  DISCOVERY: 30078, // parameterized replaceable (NIP-33)
  CONTROL: 21001, // ephemeral
  RUNNER: 21000, // ephemeral, ~5 Hz
  FINISH: 21002, // ephemeral
} as const;

/** Project discovery tag — `["t", T_TAG]` filters the lobby. */
export const T_TAG = "bitbybit-run";

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Build this peer's self-presence (kind 30078). Replaceable per author, so
 * re-announcing (e.g. changing lane) overwrites the previous one. The `#d`
 * tag is the bare matchId so it rides the same channel as control/runner/
 * finish; the `#t` tag keeps it discoverable by a future lobby browser.
 */
export function buildDiscoveryEvent(
  payload: MatchDiscovery,
  status: MatchStatus = "waiting"
): UnsignedNostrEvent {
  const tags: string[][] = [
    ["d", payload.matchId],
    ["t", T_TAG],
    ["status", status],
    ["max", String(MAX_PLAYERS)],
  ];
  if (payload.name) tags.push(["name", payload.name]);
  return {
    kind: KIND.DISCOVERY,
    created_at: nowSeconds(),
    tags,
    content: JSON.stringify(payload),
  };
}

export function buildControlEvent(payload: MatchControl): UnsignedNostrEvent {
  return {
    kind: KIND.CONTROL,
    created_at: nowSeconds(),
    tags: [["d", payload.matchId]],
    content: JSON.stringify(payload),
  };
}

export function buildRunnerEvent(
  matchId: string,
  payload: RunnerState
): UnsignedNostrEvent {
  return {
    kind: KIND.RUNNER,
    created_at: nowSeconds(),
    tags: [["d", matchId]],
    content: JSON.stringify(payload),
  };
}

export function buildFinishEvent(
  matchId: string,
  payload: MatchFinish
): UnsignedNostrEvent {
  return {
    kind: KIND.FINISH,
    created_at: nowSeconds(),
    tags: [["d", matchId]],
    content: JSON.stringify(payload),
  };
}

/**
 * A validated, typed inbound event. For `runner`/`finish`, `signer` is the
 * event's outer Nostr author (the key that actually signed it) — which is the
 * sender's ephemeral session key, *not* the real identity in `data.pubkey`.
 * Clients verify it matches the `sessionKey` that identity announced in its
 * presence, so a peer can't spoof frames as someone else.
 */
export type ParsedEvent =
  | { type: "discovery"; data: MatchDiscovery }
  | { type: "control"; data: MatchControl }
  | { type: "runner"; data: RunnerState; signer: string }
  | { type: "finish"; data: MatchFinish; signer: string };

/**
 * Validate an untrusted relay event into a typed payload, or `null` if the
 * JSON is malformed or fails its schema. Never throws — callers can drop
 * `null` and move on.
 */
export function parseEvent(event: NostrEvent): ParsedEvent | null {
  let content: unknown;
  try {
    content = JSON.parse(event.content);
  } catch {
    return null;
  }

  switch (event.kind) {
    case KIND.DISCOVERY: {
      const r = MatchDiscoverySchema.safeParse(content);
      return r.success ? { type: "discovery", data: r.data } : null;
    }
    case KIND.CONTROL: {
      const r = MatchControlSchema.safeParse(content);
      return r.success ? { type: "control", data: r.data } : null;
    }
    case KIND.RUNNER: {
      const r = RunnerStateSchema.safeParse(content);
      return r.success
        ? { type: "runner", data: r.data, signer: event.pubkey }
        : null;
    }
    case KIND.FINISH: {
      const r = MatchFinishSchema.safeParse(content);
      return r.success
        ? { type: "finish", data: r.data, signer: event.pubkey }
        : null;
    }
    default:
      return null;
  }
}

/** Subscription for the lobby: every open/active match. */
export function lobbyFilter(): Filter {
  return { kinds: [KIND.DISCOVERY], "#t": [T_TAG] };
}

/**
 * Subscription for a single match's whole channel — presence (discovery),
 * control, runner state and finish all ride the bare `#d = matchId` tag, so
 * one filter delivers the roster *and* the realtime traffic. `sinceSeconds`
 * trims replayed history when (re)joining.
 */
export function matchFilter(matchId: string, sinceSeconds?: number): Filter {
  const filter: Filter = {
    kinds: [KIND.DISCOVERY, KIND.CONTROL, KIND.RUNNER, KIND.FINISH],
    "#d": [matchId],
  };
  if (sinceSeconds !== undefined) filter.since = sinceSeconds;
  return filter;
}

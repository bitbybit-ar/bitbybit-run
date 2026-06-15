"use client";

/**
 * React adapter over `MatchClient`. Owns the client's lifecycle for the
 * duration of a match and mirrors its snapshot into React state so the
 * lobby / minimap / results UI can render off it.
 *
 * The transport and signer are injected (the signer comes from the auth
 * context; the transport defaults to public Nostr relays) so this hook
 * stays testable and the realtime backend remains swappable. No page wires
 * it up yet — it ships ahead of the lobby/race UI it will drive.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SignerHandle } from "@/lib/nostr/signers";
import { MatchClient, type RunnerInput } from "@/lib/multiplayer/match-client";
import { NostrTransport } from "@/lib/multiplayer/nostr-transport";
import type { Transport } from "@/lib/multiplayer/transport";
import type { MatchPlayer, MatchSnapshot } from "@/lib/multiplayer/types";

export interface UseMatchOptions {
  signer: SignerHandle;
  matchId: string;
  trackId: string;
  /** Match creator's pubkey (joiners pass the host they're joining). */
  host?: string;
  players?: MatchPlayer[];
  isHost?: boolean;
  /** Optional host-supplied race label, shown in the lobby browser. */
  raceName?: string;
  /** Override the realtime transport (defaults to public Nostr relays). */
  transport?: Transport;
}

export interface UseMatch {
  /** The live client, or null before the init effect runs. Exposed so the
   *  game layer can build a `RaceNet` from the same instance. */
  client: MatchClient | null;
  snapshot: MatchSnapshot;
  /** Announce/update this peer's own seat (claim a lane, set a name). */
  announceSelf: (seat: { lane: number; name?: string }) => Promise<void>;
  start: (countdownMs?: number) => Promise<void>;
  broadcastRunner: (
    input: RunnerInput,
    opts?: { force?: boolean }
  ) => Promise<boolean>;
  finish: (input: { points: number; finishTime?: number }) => Promise<void>;
}

export function useMatch(options: UseMatchOptions): UseMatch {
  const {
    signer,
    matchId,
    trackId,
    host,
    players,
    isHost,
    raceName,
    transport: injectedTransport,
  } = options;

  const clientRef = useRef<MatchClient | null>(null);
  const [client, setClient] = useState<MatchClient | null>(null);
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);

  // A new MatchClient (and a fresh default transport) per match identity.
  useEffect(() => {
    const transport = injectedTransport ?? new NostrTransport();
    const instance = new MatchClient({
      transport,
      signer,
      matchId,
      trackId,
      host,
      players,
      isHost,
      raceName,
    });
    clientRef.current = instance;
    setClient(instance);
    const unsubscribe = instance.onSnapshot(setSnapshot);

    return () => {
      unsubscribe();
      instance.leave();
      // Only close a transport we created; an injected one is the caller's.
      if (!injectedTransport) transport.close();
      clientRef.current = null;
      setClient(null);
    };
    // Re-init only on a genuine identity change. `players` is just a seed
    // (a fresh array each render); the roster aggregates from presence, so it
    // is intentionally excluded to avoid tearing down the live client.
  }, [signer, matchId, trackId, host, isHost, raceName, injectedTransport]);

  const announceSelf = useCallback(
    (seat: { lane: number; name?: string }) =>
      clientRef.current!.announceSelf(seat),
    []
  );
  const start = useCallback(
    (countdownMs?: number) => clientRef.current!.start(countdownMs),
    []
  );
  const broadcastRunner = useCallback(
    (input: RunnerInput, opts?: { force?: boolean }) =>
      clientRef.current!.broadcastRunner(input, opts),
    []
  );
  const finish = useCallback(
    (input: { points: number; finishTime?: number }) =>
      clientRef.current!.finish(input),
    []
  );

  // Stable empty snapshot for the first render before the effect runs.
  const fallback = useMemo<MatchSnapshot>(
    () => ({
      matchId,
      trackId,
      host: host ?? (isHost ? signer.pubkey : ""),
      status: "waiting",
      startAt: null,
      players: players ?? [],
      runners: {},
      finishes: {},
      standings: [],
    }),
    [matchId, trackId, host, isHost, signer.pubkey, players]
  );

  return {
    client,
    snapshot: snapshot ?? fallback,
    announceSelf,
    start,
    broadcastRunner,
    finish,
  };
}

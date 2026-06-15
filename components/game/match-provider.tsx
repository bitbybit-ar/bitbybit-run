"use client";

/**
 * Owns the match for a whole play session so it survives the lobby → race
 * handoff: the client lives here, above both the lobby and the race, and is
 * exposed two ways — the lobby reads the roster + `announceSelf`/`start`, the
 * race reads a `RaceNet` (built once from the same client) for the scene.
 *
 * The match target (host a new one, or join one from an invite link) is
 * decided by the caller and passed in as props; this component just runs it.
 * Components rendered outside a provider get the inert `DEAD` context (the
 * local single-player lobby relies on that).
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMatch } from "@/lib/hooks/use-match";
import type { SignerHandle } from "@/lib/nostr/signers";
import type { MatchSnapshot } from "@/lib/multiplayer/types";
import { createRaceNet, type RaceNet } from "@/lib/game/race-net";
import { TRACK } from "@/lib/game/track";

export interface MatchContextValue {
  /** True inside a live (signed-in) match; false for the local fallback. */
  live: boolean;
  selfPubkey: string | null;
  matchId: string | null;
  /** Is the local player the match host (may start the race)? */
  isHost: boolean;
  snapshot: MatchSnapshot | null;
  announceSelf: (seat: { lane: number; name?: string }) => Promise<void>;
  start: (countdownMs?: number) => Promise<void>;
  /** The race seam, ready once the client exists. Null when not live. */
  raceNet: RaceNet | null;
}

const DEAD: MatchContextValue = {
  live: false,
  selfPubkey: null,
  matchId: null,
  isHost: false,
  snapshot: null,
  announceSelf: async () => {},
  start: async () => {},
  raceNet: null,
};

const MatchContext = createContext<MatchContextValue>(DEAD);

export function useMatchContext(): MatchContextValue {
  return useContext(MatchContext);
}

export interface MatchProviderProps {
  signer: SignerHandle;
  pubkey: string;
  matchId: string;
  /** Is this player hosting (true) or joining an invite (false)? */
  isHost: boolean;
  /** Match creator's pubkey (self when hosting). */
  host: string;
  /** Optional host-supplied race label, shown in the lobby browser. */
  raceName?: string;
  children: ReactNode;
}

export function MatchProvider({
  signer,
  pubkey,
  matchId,
  isHost,
  host,
  raceName,
  children,
}: MatchProviderProps) {
  const match = useMatch({
    signer,
    matchId,
    trackId: TRACK.id,
    isHost,
    host,
    raceName,
  });

  // Build the race seam once the client exists; React owns its lifecycle (the
  // scene no longer disposes it), so tear it down when we unmount.
  const [raceNet, setRaceNet] = useState<RaceNet | null>(null);
  const { client } = match;
  useEffect(() => {
    if (!client) return;
    const net = createRaceNet(client);
    setRaceNet(net);
    return () => {
      net.dispose();
      setRaceNet(null);
    };
  }, [client]);

  const value = useMemo<MatchContextValue>(
    () => ({
      live: true,
      selfPubkey: pubkey,
      matchId,
      isHost,
      snapshot: match.snapshot,
      announceSelf: match.announceSelf,
      start: match.start,
      raceNet,
    }),
    [
      pubkey,
      matchId,
      isHost,
      match.snapshot,
      match.announceSelf,
      match.start,
      raceNet,
    ]
  );

  return (
    <MatchContext.Provider value={value}>{children}</MatchContext.Provider>
  );
}

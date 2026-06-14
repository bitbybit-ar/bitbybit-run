"use client";

/**
 * Lobby container — wires the presentational <CharacterSelect> to the live
 * match held by <MatchProvider> (so the same client survives into the race).
 * Claiming a runner announces this peer's own seat (kind 30078, lane = the
 * character's `startLane`); every client aggregates the presences into the
 * roster.
 *
 * Host flow: pick a runner → "Crear carrera" (publishes + reveals the invite
 * link) → "Comenzar carrera" (starts with whoever's in). Joiners pick a runner
 * and wait for the host. "Volver" leaves the match back to the races browser.
 *
 * When the match context is "dead" (no live signer: nsec / NIP-46 reload, or
 * the session still loading) it falls back to a local-only lobby so play still
 * works — claims just don't broadcast.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button/button";
import {
  CHARACTERS,
  getCharacter,
  type CharacterId,
} from "@/lib/game/characters";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  type MatchPlayer,
} from "@/lib/multiplayer/types";
import { CharacterSelect, type LobbyOccupant } from "./character-select";
import { useMatchContext, type MatchContextValue } from "./match-provider";
import styles from "./runner-lobby.module.scss";

/** A joiner waits this long for any presence before we treat the invite link
 *  as dead (the match never existed, or already ended/cleared from relays). */
const NOT_FOUND_TIMEOUT_MS = 7000;

export interface CurrentUser {
  name: string;
  avatarUrl?: string | null;
}

interface RunnerLobbyProps {
  currentUser: CurrentUser;
  /** Reports the claimed character up so the race mounts the right runner. */
  onClaim: (id: CharacterId) => void;
  /** Leave the match, back to the races browser (live match only). */
  onLeave?: () => void;
  /** Begin a *local* (single-player) race. In a live match the start flows
   *  through the match status instead, so this is only used by the fallback. */
  onStart?: () => void;
}

/** Short, readable label for a remote pubkey we have no name for. */
function shortPubkey(pubkey: string): string {
  return `${pubkey.slice(0, 6)}…${pubkey.slice(-4)}`;
}

/** Map a live roster onto lanes keyed by character id (each char owns a lane). */
function rosterToOccupants(
  players: MatchPlayer[],
  pubkey: string,
  currentUser: CurrentUser
): Partial<Record<CharacterId, LobbyOccupant>> {
  const map: Partial<Record<CharacterId, LobbyOccupant>> = {};
  for (const p of players) {
    const char = CHARACTERS.find((c) => c.startLane === p.lane);
    if (!char) continue;
    const isMe = p.pubkey === pubkey;
    map[char.id] = {
      name: isMe ? currentUser.name : p.name || shortPubkey(p.pubkey),
      avatarUrl: isMe ? currentUser.avatarUrl : null,
      isCurrentUser: isMe,
    };
  }
  return map;
}

export function RunnerLobby(props: RunnerLobbyProps) {
  const match = useMatchContext();

  if (match.live && match.selfPubkey) {
    return <WiredLobby {...props} match={match} pubkey={match.selfPubkey} />;
  }
  return <LocalLobby {...props} />;
}

function WiredLobby({
  currentUser,
  onClaim,
  onLeave,
  match,
  pubkey,
}: RunnerLobbyProps & { match: MatchContextValue; pubkey: string }) {
  const t = useTranslations("play");
  const { announceSelf, start, isHost } = match;
  const snapshot = match.snapshot;
  // Host has pressed "Crear carrera": the match is published (others can be
  // invited) and the Start button is available.
  const [created, setCreated] = useState(false);
  // The lane we last tried to claim — so we can tell when a conflict bumped us.
  const [attemptedId, setAttemptedId] = useState<CharacterId | null>(null);

  const players = useMemo(() => snapshot?.players ?? [], [snapshot]);

  const occupants = useMemo(
    () => rosterToOccupants(players, pubkey, currentUser),
    [players, pubkey, currentUser]
  );

  // We claimed a lane but lost it to an earlier claimant (the reducer resolves
  // ties deterministically) — prompt a re-pick.
  const meSeated = Object.values(occupants).some((o) => o?.isCurrentUser);
  const lostClaim =
    attemptedId !== null && !meSeated && !!occupants[attemptedId];

  // Shareable invite for the host — same /play URL with the match + host in the
  // query, so opening it joins this match instead of hosting a new one. Only
  // once the host has created the match, so a link is never shared too early.
  const inviteUrl = useMemo(() => {
    if (!isHost || !created || !match.matchId || typeof window === "undefined")
      return undefined;
    const { origin, pathname } = window.location;
    return `${origin}${pathname}?m=${encodeURIComponent(match.matchId)}&h=${pubkey}`;
  }, [isHost, created, match.matchId, pubkey]);

  const claim = useCallback(
    (id: CharacterId) => {
      const char = getCharacter(id);
      setAttemptedId(id);
      onClaim(id);
      // Announce our seat (optimistic local upsert happens inside); a relay
      // hiccup must not block the UI.
      announceSelf({ lane: char.startLane, name: currentUser.name }).catch(
        () => {}
      );
    },
    [currentUser.name, announceSelf, onClaim]
  );

  const createRace = useCallback(() => setCreated(true), []);

  // Host only — sending the start signal flips everyone into the race (the
  // parent watches match status, so no local started flag is needed).
  const startRace = useCallback(() => {
    start(0).catch(() => {});
  }, [start]);

  // Auto-start once the grid is full (4/4). Host only, fires once.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (isHost && !autoStarted.current && players.length >= MAX_PLAYERS) {
      autoStarted.current = true;
      start(0).catch(() => {});
    }
  }, [isHost, players.length, start]);

  // A joiner who never sees any presence is on a dead invite link — surface a
  // clear "not found" instead of an empty lobby that waits forever.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (isHost || players.length > 0) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), NOT_FOUND_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isHost, players.length]);

  if (timedOut && players.length === 0) {
    return <LobbyNotFound onBack={onLeave} />;
  }

  // A real match needs ≥2 runners; the host waits (Start disabled) until a
  // rival joins. The mirrors the authoritative guard in MatchClient.start.
  const enoughPlayers = players.length >= MIN_PLAYERS;
  const notice = lostClaim
    ? t("lobby.taken")
    : isHost && created && !enoughPlayers
      ? t("lobby.needPlayers", { min: MIN_PLAYERS })
      : undefined;

  return (
    <CharacterSelect
      occupants={occupants}
      playerCount={players.length}
      onClaim={claim}
      onCreate={createRace}
      onStart={startRace}
      onBack={onLeave}
      isHost={isHost}
      created={created}
      canStart={enoughPlayers}
      inviteUrl={inviteUrl}
      notice={notice}
    />
  );
}

function LocalLobby({ currentUser, onClaim, onStart, onLeave }: RunnerLobbyProps) {
  const [claimedId, setClaimedId] = useState<CharacterId | null>(null);

  const occupants = useMemo<Partial<Record<CharacterId, LobbyOccupant>>>(
    () =>
      claimedId
        ? {
            [claimedId]: {
              name: currentUser.name,
              avatarUrl: currentUser.avatarUrl,
              isCurrentUser: true,
            },
          }
        : {},
    [claimedId, currentUser]
  );

  const claim = useCallback(
    (id: CharacterId) => {
      setClaimedId(id);
      onClaim(id);
    },
    [onClaim]
  );

  return (
    <CharacterSelect
      occupants={occupants}
      playerCount={claimedId ? 1 : 0}
      onClaim={claim}
      onStart={() => onStart?.()}
      onBack={onLeave}
      // The local fallback has no match to create — start the solo race directly.
      created
    />
  );
}

/** Dead invite link — the match never showed up. Offer a way back to the
 *  races browser instead of waiting on an empty lobby forever. */
function LobbyNotFound({ onBack }: { onBack?: () => void }) {
  const t = useTranslations("play");
  return (
    <div className={styles.notFound}>
      <p className={styles.notFoundTitle}>{t("notFound.title")}</p>
      {onBack && (
        <Button size="lg" onClick={onBack}>
          {t("notFound.cta")}
        </Button>
      )}
    </div>
  );
}

/** The match already left the lobby — a latecomer can't join an in-progress (or
 *  finished) race. Reuses the not-found layout; only the copy differs. */
export function LobbyAlreadyStarted({
  onBack,
  finished = false,
}: {
  onBack?: () => void;
  finished?: boolean;
}) {
  const t = useTranslations("play");
  return (
    <div className={styles.notFound}>
      <p className={styles.notFoundTitle}>
        {finished
          ? t("alreadyStarted.titleFinished")
          : t("alreadyStarted.title")}
      </p>
      {onBack && (
        <Button size="lg" onClick={onBack}>
          {t("alreadyStarted.cta")}
        </Button>
      )}
    </div>
  );
}

export default RunnerLobby;

"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { GameCanvas } from "./game-canvas";
import { GameControls } from "./game-controls";
import { RunnerLobby, LobbyAlreadyStarted } from "./runner-lobby";
import { MatchBrowser } from "./match-browser";
import { MatchResults } from "./match-results";
import { MatchWaiting } from "./match-waiting";
import { MatchProvider, useMatchContext } from "./match-provider";
import { InterstitialAd } from "./interstitial-ad";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button/button";
import { useSignerContext } from "@/lib/contexts/signer-context";
import type { SignerHandle } from "@/lib/nostr/signers";
import { getCharacter, type CharacterId } from "@/lib/game/characters";
import styles from "./play-stage.module.scss";

type FinishResult = { time: number; points: number };

/**
 * Play flow. Normal mode: pick a character, then race. Demo mode: skip the
 * picker (Sprinter only) and, on crossing the finish line, invite the player to
 * sign in to compete for zaps.
 */
type CurrentUser = { name: string; avatarUrl?: string | null };

export function PlayStage({
  demo = false,
  currentUser,
}: {
  demo?: boolean;
  currentUser?: CurrentUser;
}) {
  if (demo) return <DemoStage />;
  return <CompetitiveStage currentUser={currentUser ?? { name: "Player" }} />;
}

/**
 * Competitive flow. With a live signer we host (or join, via an invite link)
 * a real match; without one (nsec / NIP-46 reload) we fall back to a local
 * single-player lobby so play still works.
 */
function CompetitiveStage({ currentUser }: { currentUser: CurrentUser }) {
  const { signer, session, sessionLoading, signerLoading } =
    useSignerContext();
  const t = useTranslations("play");

  // The extension signer attaches asynchronously after a reload. Until that
  // settles, don't decide between competitive and the solo fallback — otherwise
  // a logged-in user (or someone opening an invite link) flashes into a lonely
  // practice race before their signer is ready.
  if (sessionLoading || signerLoading) {
    return <p className={styles.loading}>{t("loading")}</p>;
  }
  if (signer && session?.pubkey) {
    return (
      <SignedInStage
        currentUser={currentUser}
        signer={signer}
        pubkey={session.pubkey}
      />
    );
  }
  // Logged in but no in-memory signer — an nsec/NIP-46 user who reloaded (their
  // key doesn't survive like an extension does), or an extension that's gone.
  // Offer to reconnect so they can race, instead of silently dropping to solo.
  if (session?.pubkey) {
    return <ReconnectStage currentUser={currentUser} />;
  }
  // No session at all (the /play page server-guards this, so effectively only
  // a torn-down session) → plain solo.
  return <LocalStage currentUser={currentUser} />;
}

/**
 * Logged in, but the signer isn't in memory (nsec/NIP-46 after a reload, or a
 * missing extension). Prompt a re-attach via the shared re-sign modal — on
 * success the context signer updates and this swaps to the competitive flow,
 * carrying any invite-link `?m=` into the join. A solo-practice escape hatch is
 * offered for anyone who doesn't want to reconnect.
 */
function ReconnectStage({ currentUser }: { currentUser: CurrentUser }) {
  const { requestReSignIn } = useSignerContext();
  const t = useTranslations("play");
  const [practice, setPractice] = useState(false);
  const [busy, setBusy] = useState(false);

  if (practice) {
    return (
      <LocalStage currentUser={currentUser} onLeave={() => setPractice(false)} />
    );
  }

  const reconnect = async () => {
    setBusy(true);
    try {
      // Resolves once the modal attaches a matching signer; the context update
      // re-renders CompetitiveStage into SignedInStage and unmounts this.
      await requestReSignIn();
    } catch {
      // Cancelled or failed — stay on the prompt.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.reconnect}>
      <p className={styles.reconnectTitle}>{t("reconnect.title")}</p>
      <p className={styles.reconnectText}>{t("reconnect.text")}</p>
      <div className={styles.reconnectActions}>
        <Button type="button" size="lg" onClick={reconnect} disabled={busy}>
          {t("reconnect.cta")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => setPractice(true)}
        >
          {t("reconnect.practice")}
        </Button>
      </div>
    </div>
  );
}

type Target = { matchId: string; isHost: boolean; host: string };

/**
 * Resolve which match to enter. An invite link (`?m=&h=`) jumps straight in;
 * otherwise we show the lobby browser to host a new match or join an open one.
 * The target is stable once chosen so the match client isn't re-created.
 */
function SignedInStage({
  currentUser,
  signer,
  pubkey,
}: {
  currentUser: CurrentUser;
  signer: SignerHandle;
  pubkey: string;
}) {
  const params = useSearchParams();
  const joinId = params.get("m");
  const joinHost = params.get("h");
  const [target, setTarget] = useState<Target | null>(() =>
    joinId ? { matchId: joinId, isHost: false, host: joinHost ?? "" } : null
  );
  // Solo practice from the races browser — a real (no-net) single-player race
  // that never persists to the leaderboard. Separate from `target` (a match).
  const [practice, setPractice] = useState(false);

  if (practice) {
    return (
      <LocalStage
        currentUser={currentUser}
        onLeave={() => setPractice(false)}
      />
    );
  }

  if (!target) {
    return (
      <MatchBrowser
        onHost={() =>
          setTarget({
            matchId: `bbr-${pubkey.slice(0, 8)}-${Date.now()}`,
            isHost: true,
            host: pubkey,
          })
        }
        onJoin={(matchId, host) => setTarget({ matchId, isHost: false, host })}
        onPractice={() => setPractice(true)}
      />
    );
  }

  return (
    <MatchProvider
      signer={signer}
      pubkey={pubkey}
      matchId={target.matchId}
      isHost={target.isHost}
      host={target.host}
    >
      <LobbyAndRace currentUser={currentUser} onLeave={() => setTarget(null)} />
    </MatchProvider>
  );
}

/** Inside a live match: show the lobby until the host starts (status leaves
 *  "waiting"), then the race. The same client drives both. */
function LobbyAndRace({
  currentUser,
  onLeave,
}: {
  currentUser: CurrentUser;
  onLeave?: () => void;
}) {
  const match = useMatchContext();
  const [selectedId, setSelectedId] = useState<CharacterId>("default");
  usePersistOnFinish(match);

  const snap = match.snapshot;
  const status = snap?.status ?? "waiting";
  const selfPubkey = match.selfPubkey;
  if (status === "waiting") {
    return (
      <RunnerLobby
        currentUser={currentUser}
        onClaim={setSelectedId}
        onLeave={onLeave}
      />
    );
  }

  // Past the lobby. If I never took a seat, I'm a latecomer arriving at a match
  // that already started (or finished) — joining in-progress isn't allowed, and
  // crucially this stops a returning player from re-creating/restarting it.
  const amInRoster =
    !!selfPubkey && !!snap?.players.some((p) => p.pubkey === selfPubkey);
  if (!amInRoster) {
    return (
      <LobbyAlreadyStarted
        onBack={onLeave}
        finished={status === "finished"}
      />
    );
  }

  // Only hand the scene a live net when there's company on the track —
  // otherwise a solo host would get MP behavior (lonely minimap, no restart).
  const multiplayer = (snap?.players.length ?? 0) > 1;

  // The match ends only once every runner has crossed (or the grace timeout
  // fires) → everyone sees the standings (multiplayer only). A reconnecting
  // player lands here too.
  if (status === "finished" && multiplayer && snap && selfPubkey) {
    return (
      <MatchResults
        snapshot={snap}
        selfPubkey={selfPubkey}
        onPlayAgain={onLeave}
      />
    );
  }

  // I've crossed but others are still racing → wait on a live-ranking screen
  // (my own scene is frozen at the line) until the match resolves.
  const selfFinished = !!selfPubkey && !!snap?.finishes[selfPubkey];
  if (selfFinished && multiplayer && snap && selfPubkey) {
    return <MatchWaiting snapshot={snap} selfPubkey={selfPubkey} />;
  }

  return (
    <div className={styles.wrap}>
      <GameCanvas
        key={selectedId}
        character={getCharacter(selectedId)}
        raceNet={multiplayer ? (match.raceNet ?? undefined) : undefined}
        matchId={match.matchId ?? undefined}
      />
      <GameControls />
    </div>
  );
}

/**
 * Once a real match (≥2 players) finishes, the host posts the final standings
 * to persist them for the leaderboard — exactly once, best-effort.
 */
function usePersistOnFinish(match: ReturnType<typeof useMatchContext>) {
  const postedRef = useRef(false);
  const snap = match.snapshot;
  const finished = snap?.status === "finished";
  const multiplayer = (snap?.players.length ?? 0) > 1;

  useEffect(() => {
    if (postedRef.current) return;
    if (!match.isHost || !finished || !multiplayer || !snap) return;
    postedRef.current = true;
    void fetch("/api/matches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nostrId: snap.matchId,
        trackId: snap.trackId,
        host: match.selfPubkey,
        startedAt: snap.startAt,
        standings: snap.standings,
      }),
    }).catch(() => {});
  }, [match.isHost, match.selfPubkey, finished, multiplayer, snap]);
}

/**
 * A local single-player race (no match, no network). Used both as the no-live-
 * signer fallback and as explicit "practice" from the races browser. Solo runs
 * never persist to the leaderboard — there's no match to post.
 */
function LocalStage({
  currentUser,
  onLeave,
}: {
  currentUser: CurrentUser;
  onLeave?: () => void;
}) {
  const [selectedId, setSelectedId] = useState<CharacterId>("default");
  const [started, setStarted] = useState(false);

  if (!started) {
    return (
      <RunnerLobby
        currentUser={currentUser}
        onClaim={setSelectedId}
        onStart={() => setStarted(true)}
        onLeave={onLeave}
      />
    );
  }
  return (
    <div className={styles.wrap}>
      <GameCanvas key={selectedId} character={getCharacter(selectedId)} />
      <GameControls />
    </div>
  );
}

/** Free single-player demo: no match, finish invites sign-in. */
function DemoStage() {
  const tDemo = useTranslations("demo");
  const [finish, setFinish] = useState<FinishResult | null>(null);
  const [showAd, setShowAd] = useState(false);
  // Bumped to remount GameCanvas (Phaser builds on mount) for a fresh round.
  const [runId, setRunId] = useState(0);

  return (
    <div className={styles.wrap}>
      <GameCanvas
        key={runId}
        character={getCharacter("default")}
        onFinish={setFinish}
      />
      <GameControls />

      {finish && (
        <Modal
          onClose={() => setFinish(null)}
          title={tDemo("finishTitle")}
          ariaLabel={tDemo("finishTitle")}
          size="sm"
        >
          <div className={styles.invite}>
            <p className={styles.inviteStats}>
              {finish.time.toFixed(1)}s · {finish.points} pts
            </p>
            <p className={styles.inviteText}>{tDemo("finishText")}</p>
            <div className={styles.inviteActions}>
              <Button
                href={{ pathname: "/sign-in", query: { next: "/play" } }}
                size="lg"
              >
                {tDemo("login")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => {
                  // Swap the finish modal for the ad so they don't stack.
                  setFinish(null);
                  setShowAd(true);
                }}
              >
                {tDemo("keepPlaying")}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {showAd && (
        <InterstitialAd
          onDone={() => {
            // Dismissing the ad ends the round: close everything and remount
            // the canvas so a brand-new race starts from the line.
            setShowAd(false);
            setFinish(null);
            setRunId((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}

export default PlayStage;

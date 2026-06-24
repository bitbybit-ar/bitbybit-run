"use client";

import { useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_CHARACTER, type Character } from "@/lib/game/characters";
import type { RaceNet } from "@/lib/game/race-net";
import styles from "./game-canvas.module.scss";

/**
 * Mounts the Phaser game into a div, client-side only.
 *
 * Phaser touches `window`/`document` at import time, so we import it (and the
 * scene) lazily inside useEffect — it never runs during SSR. That also means
 * the play page can stay a normal Server Component.
 *
 * Localized in-game strings are read here (React has the i18n context) and
 * handed to the scene, so the canvas text follows the current locale.
 */
export function GameCanvas({
  character = DEFAULT_CHARACTER,
  onFinish,
  raceNet,
  matchId,
  practice = false,
}: {
  character?: Character;
  onFinish?: (result: { time: number; points: number }) => void;
  /** Multiplayer port (from the lobby). Absent → the canvas is single-player. */
  raceNet?: RaceNet;
  /** Live match id — seeds the per-match track + keys the reconnect resume. */
  matchId?: string;
  /** Solo practice run — shows a "doesn't count for the ranking" note at the
   *  finish. Off for matches and the demo. */
  practice?: boolean;
}) {
  const t = useTranslations("game");
  const locale = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  // Keep the latest callback without re-running the game-creation effect.
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  // The match is fixed for this canvas's life; read at boot, don't re-create.
  const raceNetRef = useRef(raceNet);
  raceNetRef.current = raceNet;
  const matchIdRef = useRef(matchId);
  matchIdRef.current = matchId;
  // Latest strings/character, read at boot only. Kept in refs so the
  // game-creation effect can depend on *stable primitives* (locale + character
  // id) instead of the `t` function and `character` object — otherwise a parent
  // re-render (in a live match the snapshot ticks ~5 Hz) could rebuild the whole
  // Phaser game and visibly restart the race for everyone. See docs/MULTIPLAYER.
  const tRef = useRef(t);
  tRef.current = t;
  const characterRef = useRef(character);
  characterRef.current = character;
  const practiceRef = useRef(practice);
  practiceRef.current = practice;

  useEffect(() => {
    // Guard against React StrictMode double-invoke in dev.
    if (startedRef.current) return;
    startedRef.current = true;

    let game: import("phaser").Game | undefined;
    let cancelled = false;

    const tt = tRef.current;
    const ch = characterRef.current;
    const strings = {
      go: tt("go"),
      finish: tt("finish"),
      again: tt("again"),
      againTouch: tt("againTouch"),
      practiceNote: practiceRef.current ? tt("practiceNote") : undefined,
      goodPhrases: tt.raw("goodPhrases") as string[],
      badPhrases: tt.raw("badPhrases") as string[],
      boostPhrases: tt.raw("boostPhrases") as string[],
      bathrooms: tt.raw("bathrooms") as string[],
      signs: tt.raw("signs") as string[],
    };

    const sprite = {
      sheet: ch.sheet,
      frameWidth: ch.frameWidth,
      frameHeight: ch.frameHeight,
      startLane: ch.startLane,
    };

    (async () => {
      const Phaser = await import("phaser");
      const { createGameConfig } = await import("@/lib/game/scenes/race-scene");
      // Wait for web fonts so Phaser's canvas text renders in Nunito, not a
      // fallback that would flash and re-layout.
      if (document.fonts?.ready) await document.fonts.ready;
      if (cancelled || !containerRef.current) return;
      game = new Phaser.Game(
        createGameConfig(
          containerRef.current,
          strings,
          sprite,
          (result) => onFinishRef.current?.(result),
          raceNetRef.current,
          matchIdRef.current
        )
      );
    })();

    return () => {
      cancelled = true;
      game?.destroy(true);
      startedRef.current = false;
    };
    // Re-create the game ONLY when the locale or chosen character changes —
    // never on an ordinary re-render. Depend on stable primitives (locale +
    // character.id); `t` and `character` are read fresh via refs at boot.
  }, [locale, character.id]);

  return <div ref={containerRef} className={styles.canvas} />;
}

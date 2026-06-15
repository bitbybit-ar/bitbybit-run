"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { resolveStandings } from "@/lib/multiplayer/match-state";
import { useCountdown } from "@/lib/hooks/use-countdown";
import { shortPubkey, cn } from "@/lib/utils";
import type { MatchSnapshot } from "@/lib/multiplayer/types";
import { Confetti } from "./confetti";
import styles from "./match-waiting.module.scss";

/**
 * Shown to a runner who has crossed the line while the rest are still racing.
 * The match ends only once everyone has finished/left (or the grace timeout
 * fires), so this turns the wait into a spectator moment instead of dead time:
 *
 *  - a live **countdown** to the auto-resolve so the leader knows it's bounded
 *    (and is less tempted to leave, which would force the others to DNF),
 *  - **progress bars** of the rivals still on the track, advancing in real time
 *    off the ~5 Hz runner frames,
 *  - **confetti** for whoever's currently leading, and rotating cheer lines.
 */
export function MatchWaiting({
  snapshot,
  selfPubkey,
}: {
  snapshot: MatchSnapshot;
  selfPubkey: string;
}) {
  const tw = useTranslations("play.waiting");

  const seats = new Map(snapshot.players.map((p) => [p.pubkey, p]));
  const startAt = snapshot.startAt;
  const standings = resolveStandings(snapshot);
  const leading = standings[0]?.pubkey === selfPubkey;

  const secondsLeft = useCountdown(snapshot.finishGraceUntil);
  const cheer = useRotating(tw.raw("cheers") as string[]);

  const rows = standings.map((s) => {
    const seat = seats.get(s.pubkey);
    const finished = s.finishTime != null && startAt != null;
    const left = !!seat?.left && !finished;
    const progress = finished
      ? 1
      : (snapshot.runners[s.pubkey]?.progress ?? 0);
    const status = finished
      ? `${((s.finishTime! - startAt!) / 1000).toFixed(1)}s`
      : left
        ? tw("left")
        : tw("racing");
    return {
      pubkey: s.pubkey,
      name: seat?.name?.trim() || shortPubkey(s.pubkey),
      finished,
      left,
      progress,
      status,
      isSelf: s.pubkey === selfPubkey,
    };
  });

  return (
    <section className={styles.waiting}>
      {leading && <Confetti />}

      <h2 className={styles.heading}>
        {leading ? tw("leading") : tw("finished")}
      </h2>
      <p className={styles.subtitle}>{tw("subtitle")}</p>
      {secondsLeft != null && (
        <p className={styles.countdown} aria-live="polite">
          {tw("resultsIn", { seconds: secondsLeft })}
        </p>
      )}

      <ul className={styles.spectator}>
        {rows.map((r, i) => (
          <li
            key={r.pubkey}
            className={cn(
              styles.row,
              r.isSelf && styles.me,
              r.left && styles.leftRow
            )}
          >
            <span className={styles.rank}>{i + 1}</span>
            <span className={styles.name}>{r.name}</span>
            <span className={styles.track} aria-hidden="true">
              <span
                className={cn(
                  styles.fill,
                  r.finished && styles.fillDone,
                  r.left && styles.fillLeft
                )}
                style={{ width: `${Math.round(r.progress * 100)}%` }}
              />
            </span>
            <span className={styles.status}>{r.status}</span>
          </li>
        ))}
      </ul>

      <p className={styles.cheer} aria-live="polite">
        {cheer}
      </p>
    </section>
  );
}

/** Cycle through `items` on an interval so the waiting screen feels alive. */
function useRotating(items: string[], intervalMs = 3500): string {
  const [i, setI] = useState(0);
  const n = items.length;
  useEffect(() => {
    if (n <= 1) return;
    const id = setInterval(() => setI((prev) => (prev + 1) % n), intervalMs);
    return () => clearInterval(id);
  }, [n, intervalMs]);
  return items[i % Math.max(1, n)] ?? "";
}

export default MatchWaiting;

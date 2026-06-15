"use client";

import { useTranslations } from "next-intl";
import { useCountdown } from "@/lib/hooks/use-countdown";
import { shortPubkey, cn } from "@/lib/utils";
import type { MatchSnapshot } from "@/lib/multiplayer/types";
import styles from "./race-finish-banner.module.scss";

/**
 * Overlaid on a runner who is still racing once a rival has crossed the line:
 * the match force-ends `FINISH_GRACE_MS` after the first finish, so this warns
 * them — with a live countdown — that they have limited time to reach the line,
 * instead of being yanked to the results screen out of nowhere (which is how
 * the "race ended unexpectedly" complaint happened). Renders nothing until the
 * first finisher arms the shared `finishGraceUntil` deadline.
 */
export function RaceFinishBanner({ snapshot }: { snapshot: MatchSnapshot }) {
  const t = useTranslations("play.race");
  const seconds = useCountdown(snapshot.finishGraceUntil);

  const first = Object.values(snapshot.finishes).sort(
    (a, b) => a.finishTime - b.finishTime
  )[0];
  if (seconds == null || !first) return null;

  const seat = snapshot.players.find((p) => p.pubkey === first.pubkey);
  const name = seat?.name?.trim() || shortPubkey(first.pubkey);
  const urgent = seconds <= 5;

  return (
    <div className={cn(styles.banner, urgent && styles.urgent)} role="status">
      {urgent
        ? t("lastCall", { seconds })
        : t("firstFinisher", { name, seconds })}
    </div>
  );
}

export default RaceFinishBanner;

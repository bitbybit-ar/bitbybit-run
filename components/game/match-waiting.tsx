"use client";

import { useTranslations } from "next-intl";
import { RankingTable } from "@/components/leaderboard/ranking-table";
import { resolveStandings } from "@/lib/multiplayer/match-state";
import { shortPubkey } from "@/lib/utils";
import type { MatchSnapshot } from "@/lib/multiplayer/types";
import styles from "./match-results.module.scss";

/**
 * Shown to a runner who has crossed the line while the rest are still racing —
 * the match ends only once everyone has finished (or the grace timeout fires).
 * Reuses the results <RankingTable> with a *live* ranking recomputed from the
 * snapshot each render: finishers by time, the rest by track progress, so the
 * waiting runner watches the others arrive in real time.
 */
export function MatchWaiting({
  snapshot,
  selfPubkey,
}: {
  snapshot: MatchSnapshot;
  selfPubkey: string;
}) {
  const t = useTranslations("play.results");
  const tw = useTranslations("play.waiting");

  const seats = new Map(snapshot.players.map((p) => [p.pubkey, p]));
  const startAt = snapshot.startAt;
  const standings = resolveStandings(snapshot);

  const rows = standings.map((s) => {
    const seat = seats.get(s.pubkey);
    const finished = s.finishTime != null && startAt != null;
    return {
      key: s.pubkey,
      name: seat?.name?.trim() || shortPubkey(s.pubkey),
      values: [
        finished ? `${((s.finishTime! - startAt!) / 1000).toFixed(1)}s` : tw("racing"),
        s.points,
      ],
      isCurrentUser: s.pubkey === selfPubkey,
    };
  });

  const leading = standings[0]?.pubkey === selfPubkey;

  return (
    <section className={styles.results}>
      <h2 className={styles.heading}>
        {leading ? tw("leading") : tw("finished")}
      </h2>
      <p className={styles.subtitle}>{tw("subtitle")}</p>

      <RankingTable
        rankLabel={t("rank")}
        playerLabel={t("player")}
        columns={[{ label: t("time") }, { label: t("points") }]}
        rows={rows}
      />
    </section>
  );
}

export default MatchWaiting;

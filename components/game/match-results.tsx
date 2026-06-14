"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button/button";
import { RankingTable } from "@/components/leaderboard/ranking-table";
import { ZapWinner } from "./zap-winner";
import { shortPubkey } from "@/lib/utils";
import type { MatchSnapshot } from "@/lib/multiplayer/types";
import styles from "./match-results.module.scss";

/**
 * End-of-match standings — shown once every runner has finished. Reuses the
 * global leaderboard's <RankingTable> so the two rankings look identical:
 * podium-colored rank badges, player chips, right-aligned numeric columns
 * (here: race time + points). The local player's row is highlighted.
 */
export function MatchResults({
  snapshot,
  selfPubkey,
  onPlayAgain,
}: {
  snapshot: MatchSnapshot;
  selfPubkey: string;
  /** Reset the match and return to the lobby browser to host/join a new one.
   *  A plain link to /play wouldn't re-mount this already-mounted route. */
  onPlayAgain?: () => void;
}) {
  const t = useTranslations("play.results");

  const seats = new Map(snapshot.players.map((p) => [p.pubkey, p]));
  const startAt = snapshot.startAt;

  const rows = snapshot.standings.map((s) => {
    const seat = seats.get(s.pubkey);
    const time =
      s.finishTime != null && startAt != null
        ? `${((s.finishTime - startAt) / 1000).toFixed(1)}s`
        : t("dnf");
    return {
      key: s.pubkey,
      name: seat?.name?.trim() || shortPubkey(s.pubkey),
      values: [time, s.points],
      isCurrentUser: s.pubkey === selfPubkey,
    };
  });

  const winner = snapshot.standings[0];
  const iWon = winner?.pubkey === selfPubkey;
  const winnerName =
    seats.get(winner?.pubkey ?? "")?.name?.trim() ||
    (winner ? shortPubkey(winner.pubkey) : "");

  return (
    <section className={styles.results}>
      <h2 className={styles.heading}>
        {iWon ? t("youWon") : t("winner", { name: winnerName })}
      </h2>

      <RankingTable
        rankLabel={t("rank")}
        playerLabel={t("player")}
        columns={[{ label: t("time") }, { label: t("points") }]}
        rows={rows}
      />

      {/* Tip the winner over Lightning — never shown to the winner. */}
      {winner && !iWon && (
        <ZapWinner winnerPubkey={winner.pubkey} winnerName={winnerName} />
      )}

      <div className={styles.actions}>
        <Button href={{ pathname: "/leaderboard" }} size="lg">
          {t("toLeaderboard")}
        </Button>
        {onPlayAgain ? (
          <Button
            type="button"
            onClick={onPlayAgain}
            variant="outline"
            size="lg"
          >
            {t("playAgain")}
          </Button>
        ) : (
          <Button href={{ pathname: "/play" }} variant="outline" size="lg">
            {t("playAgain")}
          </Button>
        )}
      </div>
    </section>
  );
}

export default MatchResults;

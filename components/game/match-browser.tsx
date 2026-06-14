"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button/button";
import { useMatchDiscovery } from "@/lib/hooks/use-match-discovery";
import { MAX_PLAYERS } from "@/lib/multiplayer/types";
import { shortPubkey } from "@/lib/utils";
import styles from "./match-browser.module.scss";

/**
 * Lobby home: host a new match, or join an open one discovered on the relays.
 * Bypassed when arriving via an invite link (the parent jumps straight in).
 */
export function MatchBrowser({
  onHost,
  onJoin,
  onPractice,
}: {
  onHost: () => void;
  onJoin: (matchId: string, host: string) => void;
  /** Start a solo practice race (no match, never counts for the ranking). */
  onPractice?: () => void;
}) {
  const t = useTranslations("play.browser");
  const { matches, loading } = useMatchDiscovery();

  return (
    <section className={styles.browser}>
      <header className={styles.header}>
        <h2 className={styles.title}>{t("title")}</h2>
        <p className={styles.subtitle}>{t("subtitle")}</p>
      </header>

      <div className={styles.cta}>
        <Button type="button" size="lg" onClick={onHost}>
          {t("host")}
        </Button>
        {onPractice && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onPractice}
          >
            {t("practice")}
          </Button>
        )}
      </div>

      <div className={styles.list}>
        <h3 className={styles.listTitle}>{t("openMatches")}</h3>

        {loading ? (
          <p className={styles.note}>{t("loading")}</p>
        ) : matches.length === 0 ? (
          <p className={styles.note}>{t("empty")}</p>
        ) : (
          <ul className={styles.matches}>
            {matches.map((m) => (
              <li key={m.matchId} className={styles.match}>
                <span className={styles.matchInfo}>
                  <span className={styles.hostName}>
                    {m.hostName?.trim() || shortPubkey(m.host)}
                  </span>
                  <span className={styles.count}>
                    {t("players", { count: m.players, max: MAX_PLAYERS })}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onJoin(m.matchId, m.host)}
                >
                  {t("join")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default MatchBrowser;

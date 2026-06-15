"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button/button";
import { Modal } from "@/components/ui/modal";
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
  /** Host a new match, optionally labelled so players can find it. */
  onHost: (raceName?: string) => void;
  onJoin: (matchId: string, host: string) => void;
  /** Start a solo practice race (no match, never counts for the ranking). */
  onPractice?: () => void;
}) {
  const t = useTranslations("play.browser");
  const { matches, loading } = useMatchDiscovery();
  // The race name is asked for in a prompt opened by "Create race" — not shown
  // inline upfront — so the browser stays focused on choosing what to play.
  const [naming, setNaming] = useState(false);
  const [raceName, setRaceName] = useState("");

  const submitHost = () => {
    setNaming(false);
    onHost(raceName.trim() || undefined);
  };

  return (
    <section className={styles.browser}>
      <header className={styles.header}>
        <h2 className={styles.title}>{t("title")}</h2>
        <p className={styles.subtitle}>{t("subtitle")}</p>
      </header>

      <div className={styles.cta}>
        <div className={styles.ctaButtons}>
          <Button type="button" size="lg" onClick={() => setNaming(true)}>
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
      </div>

      {naming && (
        <Modal title={t("nameTitle")} onClose={() => setNaming(false)} size="sm">
          <form
            className={styles.nameForm}
            onSubmit={(e) => {
              e.preventDefault();
              submitHost();
            }}
          >
            <label className={styles.nameField}>
              <span className={styles.nameLabel}>{t("nameLabel")}</span>
              <input
                type="text"
                className={styles.nameInput}
                value={raceName}
                onChange={(e) => setRaceName(e.target.value)}
                placeholder={t("namePlaceholder")}
                maxLength={80}
                autoFocus
              />
            </label>
            <Button type="submit" size="lg">
              {t("nameConfirm")}
            </Button>
          </form>
        </Modal>
      )}

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
                    {m.raceName?.trim() ||
                      m.hostName?.trim() ||
                      shortPubkey(m.host)}
                  </span>
                  <span className={styles.count}>
                    {/* When the race is named, attribute the host on the
                        secondary line; otherwise just show the player count. */}
                    {m.raceName?.trim()
                      ? t("hostedBy", {
                          host: m.hostName?.trim() || shortPubkey(m.host),
                          count: m.players,
                          max: MAX_PLAYERS,
                        })
                      : t("players", { count: m.players, max: MAX_PLAYERS })}
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

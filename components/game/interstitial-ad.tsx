"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { CloseIcon } from "@/components/icons";
import { Button } from "@/components/ui/button/button";
import { FAKE_ADS, type FakeAd } from "@/lib/fake-ads/ads";
import { cn } from "@/lib/utils";
import styles from "./interstitial-ad.module.scss";

/** Seconds the fake "Skip ad in Ns" countdown runs before the ✕ unlocks. */
const SKIP_SECONDS = 5;

function randomAd(): FakeAd {
  return FAKE_ADS[Math.floor(Math.random() * FAKE_ADS.length)];
}

/**
 * Fake full-screen interstitial shown when a demo player taps "keep playing" —
 * the satirical take on mobile games that make you watch an ad to continue. A
 * bogus "skip in Ns" countdown gates the close button; only when it hits zero
 * does the ✕ appear, and dismissing it returns to the game. Tapping the ad
 * itself "falls for it" and routes to the matching /gotcha gag page.
 *
 * Built as a bespoke overlay (not the shared Modal) precisely because the close
 * affordance must stay locked during the countdown — the shared Modal always
 * offers an immediate close, Escape, and click-outside.
 */
export function InterstitialAd({ onDone }: { onDone: () => void }) {
  const t = useTranslations("fakeAds");
  // Pick once per mount; a fresh demo round gets a fresh ad.
  const [ad] = useState(randomAd);
  const [secondsLeft, setSecondsLeft] = useState(SKIP_SECONDS);

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((n) => (n <= 1 ? 0 : n - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Lock background scroll while the interstitial is up (mirrors the Modal).
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const canSkip = secondsLeft <= 0;

  const overlay = (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={t(`ads.${ad.id}.title`)}
    >
      <div className={cn(styles.card, styles[ad.variant])}>
        <span className={styles.badge}>{t("badgeAd")}</span>

        {canSkip ? (
          <button
            type="button"
            className={styles.skip}
            onClick={onDone}
            aria-label={t("skip")}
          >
            <CloseIcon size={20} />
          </button>
        ) : (
          <span className={styles.countdown}>
            {t("skipIn", { seconds: secondsLeft })}
          </span>
        )}

        <Link
          href={`/gotcha/${ad.id}`}
          className={styles.creative}
          aria-label={t(`ads.${ad.id}.title`)}
        >
          <span className={styles.emoji} aria-hidden="true">
            {ad.emoji}
          </span>
          <span className={styles.title}>{t(`ads.${ad.id}.title`)}</span>
        </Link>

        <Button href={`/gotcha/${ad.id}`} variant="primary" size="lg" fullWidth>
          {t(`ads.${ad.id}.cta`)}
        </Button>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}

export default InterstitialAd;

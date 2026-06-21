"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowIcon } from "@/components/icons/arrow-icon";
import styles from "./game-controls.module.scss";

function Cap({ children }: { children: ReactNode }) {
  return <kbd className={styles.cap}>{children}</kbd>;
}

/** On-screen control legend. Shows the keyboard keys on desktop and tap/hold
 *  hints on touch devices (coarse pointers) — swapped purely with CSS so there's
 *  no hydration flash. */
export function GameControls() {
  const t = useTranslations("play.controls");

  return (
    <div className={styles.controls}>
      {/* Keyboard legend — desktop / fine pointers. */}
      <div className={styles.keyboard}>
        <div className={styles.item}>
          <span className={styles.keys}>
            <Cap>
              <ArrowIcon dir="left" />
            </Cap>
            <Cap>
              <ArrowIcon dir="right" />
            </Cap>
            <span className={styles.or}>/</span>
            <Cap>A</Cap>
            <Cap>D</Cap>
          </span>
          <span className={styles.label}>{t("changeLane")}</span>
        </div>

        <div className={styles.item}>
          <span className={styles.keys}>
            <Cap>
              <ArrowIcon dir="up" />
            </Cap>
            <span className={styles.or}>/</span>
            <Cap>W</Cap>
          </span>
          <span className={styles.label}>{t("sprint")}</span>
        </div>

        <div className={styles.item}>
          <span className={styles.keys}>
            <Cap>
              <ArrowIcon dir="down" />
            </Cap>
            <span className={styles.or}>/</span>
            <Cap>S</Cap>
          </span>
          <span className={styles.label}>{t("brake")}</span>
        </div>

        <div className={styles.item}>
          <span className={styles.keys}>
            <Cap>R</Cap>
          </span>
          <span className={styles.label}>{t("restart")}</span>
        </div>
      </div>

      {/* Touch legend — coarse pointers / mobile (no keys). */}
      <div className={styles.touch}>
        <span className={styles.touchHint}>
          <span className={styles.touchGlyph}>
            <ArrowIcon dir="left" size={18} />
            <ArrowIcon dir="right" size={18} />
          </span>
          {t("touchLanes")}
        </span>
        <span className={styles.touchHint}>
          <span className={styles.touchGlyph} aria-hidden>
            ⚡
          </span>
          {t("touchSprint")}
        </span>
      </div>
    </div>
  );
}

export default GameControls;

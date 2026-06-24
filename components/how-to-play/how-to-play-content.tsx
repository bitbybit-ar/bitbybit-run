"use client";

import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button/button";
import { ArrowIcon } from "@/components/icons/arrow-icon";
import { FOODS, GOOD_IDS, BAD_IDS, BOOST_IDS } from "@/lib/game/foods";
import styles from "./how-to-play-content.module.scss";

function Key({
  children,
  label,
}: {
  children: React.ReactNode;
  label?: string;
}) {
  // `label` gives icon-only arrow keys an accessible name (the SVG is
  // aria-hidden); text keys like "R" are announced from their content.
  return (
    <kbd className={styles.key} aria-label={label}>
      {children}
    </kbd>
  );
}

function FoodChips({
  ids,
  kind,
}: {
  ids: string[];
  kind: "good" | "bad" | "boost";
}) {
  const valueClass =
    kind === "good"
      ? styles.chipGood
      : kind === "boost"
        ? styles.chipBoost
        : styles.chipBad;
  return (
    <ul className={styles.chips}>
      {ids.map((id) => {
        const f = FOODS[id];
        const label = f.points >= 0 ? `+${f.points}` : `${f.points}`;
        return (
          <li key={id} className={styles.chip}>
            <span className={styles.chipIcon}>{f.icon}</span>
            <span className={valueClass}>{label}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Controls() {
  const t = useTranslations("howToPlay");
  return (
    <div className={styles.controlsGrid}>
      {/* Keyboard (desktop) — left column. */}
      <div className={styles.controlsCol}>
        <p className={styles.controlsLabel}>{t("controlsKeyboard")}</p>
        <ul className={styles.controls}>
          <li>
            <span className={styles.keys}>
              <Key label="←">
                <ArrowIcon dir="left" />
              </Key>
              <Key label="→">
                <ArrowIcon dir="right" />
              </Key>
            </span>
            {t("controlsLanes")}
          </li>
          <li>
            <span className={styles.keys}>
              <Key label="↑">
                <ArrowIcon dir="up" />
              </Key>
            </span>
            {t("controlsSprint")}
          </li>
          <li>
            <span className={styles.keys}>
              <Key label="↓">
                <ArrowIcon dir="down" />
              </Key>
            </span>
            {t("controlsBrake")}
          </li>
          <li>
            <span className={styles.keys}>
              <Key>R</Key>
            </span>
            {t("controlsRestart")}
          </li>
        </ul>
      </div>

      {/* On-screen gamepad (touch devices): mirrors the buttons drawn in-game —
          ◀ ▶ under the left thumb, a held ⚡ accelerate button under the right.
          Right column. */}
      <div className={styles.controlsCol}>
        <p className={styles.controlsLabel}>{t("controlsTouch")}</p>
        <ul className={styles.controls}>
          <li>
            <span className={styles.touchKeys}>
              <span className={styles.touchKey} aria-label="left">
                <ArrowIcon dir="left" />
              </span>
              <span className={styles.touchKey} aria-label="right">
                <ArrowIcon dir="right" />
              </span>
            </span>
            {t("controlsTouchLanes")}
          </li>
          <li>
            <span className={styles.touchKeys}>
              <span className={styles.touchKey} aria-hidden>
                ⚡
              </span>
            </span>
            {t("controlsTouchSprint")}
          </li>
          <li>
            <span className={styles.touchKeys}>
              <span className={styles.touchKey} aria-hidden>
                👆
              </span>
            </span>
            {t("controlsTouchRestart")}
          </li>
        </ul>
      </div>
    </div>
  );
}

export function HowToPlayContent() {
  const t = useTranslations("howToPlay");
  const reduce = useReducedMotion();

  const card = (i: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 20 },
          animate: { opacity: 1, y: 0 },
          transition: {
            duration: 0.4,
            delay: 0.1 + i * 0.07,
            ease: "easeOut" as const,
          },
        };

  const intro = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.4, delay },
        };

  return (
    <div className={styles.page}>
      <motion.h1 className={styles.title} {...intro(0)}>
        {t("title")}
      </motion.h1>
      <motion.p className={styles.intro} {...intro(0.05)}>
        {t("intro")}
      </motion.p>

      {/* Goal — highlighted full-width banner that opens the guide. */}
      <motion.article className={styles.goal} {...card(0)}>
        <h2 className={styles.cardTitle}>{t("goalTitle")}</h2>
        <p className={styles.cardText}>{t("goalText")}</p>
      </motion.article>

      {/* Pickups — the three food types side by side. */}
      <div className={styles.foodGrid}>
        <motion.article className={styles.card} {...card(1)}>
          <h2 className={styles.cardTitle}>{t("energyTitle")}</h2>
          <p className={styles.cardText}>{t("energyText")}</p>
          <FoodChips ids={GOOD_IDS} kind="good" />
        </motion.article>

        <motion.article className={styles.card} {...card(2)}>
          <h2 className={styles.cardTitle}>{t("poisonTitle")}</h2>
          <p className={styles.cardText}>{t("poisonText")}</p>
          <FoodChips ids={BAD_IDS} kind="bad" />
        </motion.article>

        <motion.article className={styles.card} {...card(3)}>
          <h2 className={styles.cardTitle}>{t("boostTitle")}</h2>
          <p className={styles.cardText}>{t("boostText")}</p>
          <FoodChips ids={BOOST_IDS} kind="boost" />
        </motion.article>
      </div>

      {/* Controls — full-width card with keyboard and touch layouts. */}
      <motion.article className={styles.card} {...card(4)}>
        <h2 className={styles.cardTitle}>{t("controlsTitle")}</h2>
        <Controls />
      </motion.article>

      {/* Outcome — what happens after the race. */}
      <div className={styles.outcomeGrid}>
        <motion.article className={styles.card} {...card(5)}>
          <h2 className={styles.cardTitle}>{t("zapTitle")}</h2>
          <p className={styles.cardText}>{t("zapText")}</p>
        </motion.article>

        <motion.article className={styles.card} {...card(6)}>
          <h2 className={styles.cardTitle}>{t("rankingTitle")}</h2>
          <p className={styles.cardText}>{t("rankingText")}</p>
        </motion.article>
      </div>

      <motion.div className={styles.actions} {...intro(0.6)}>
        <Button href="/demo" variant="outline" size="lg">
          {t("demo")}
        </Button>
        <Button href="/play" size="lg">
          {t("cta")}
        </Button>
      </motion.div>
    </div>
  );
}

export default HowToPlayContent;

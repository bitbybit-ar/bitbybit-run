import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button/button";
import styles from "./page.module.scss";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "offline" });
  return { title: t("pageTitle") };
}

/**
 * Offline fallback. The service worker serves this precached page when a
 * navigation can't reach the network (see `public/sw.js`). It points the player
 * at practice — the one mode that runs fully client-side — and explains that
 * multiplayer needs a connection.
 */
export default async function OfflinePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("offline");

  return (
    <div className={styles.page}>
      <span className={styles.icon} aria-hidden="true">
        📡
      </span>
      <h1 className={styles.title}>{t("pageTitle")}</h1>
      <p className={styles.body}>{t("pageBody")}</p>
      <div className={styles.actions}>
        <Button href="/demo" size="lg">
          {t("pagePractice")}
        </Button>
        <Button href="/" variant="outline" size="lg">
          {t("pageHome")}
        </Button>
      </div>
    </div>
  );
}

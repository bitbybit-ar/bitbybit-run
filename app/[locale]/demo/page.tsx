import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { GameHeader } from "@/components/game/game-header/game-header";
import { PlayStage } from "@/components/game/play-stage";
import { pageMetadata } from "@/lib/seo";
import styles from "../play/page.module.scss";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "demo" });
  return pageMetadata({
    locale,
    path: "/demo",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

// Free single-player demo: no login required, Sprinter only. Crossing the
// finish line invites the player to sign in to compete for zaps.
export default async function DemoPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("demo");

  return (
    <div className={styles.page}>
      <GameHeader backHref="/how-to-play" phase={t("phase")} />
      <div className={styles.stage}>
        <PlayStage demo />
      </div>
    </div>
  );
}

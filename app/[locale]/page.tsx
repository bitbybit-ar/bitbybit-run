import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button/button";
import { Container } from "@/components/ui/container";
import { HeroTitle } from "@/components/landing/hero-title";
import { Polaroid } from "@/components/landing/polaroid";
import { CHARACTERS } from "@/lib/game/characters";
import { pageMetadata } from "@/lib/seo";
import styles from "./page.module.scss";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return pageMetadata({ locale, path: "/", description: t("description") });
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("landing");

  const leftCast = CHARACTERS.slice(0, 2);
  const rightCast = CHARACTERS.slice(2, 4);

  return (
    <Container fill>
      <div className={styles.hero}>
        <div className={styles.cast}>
          {leftCast.map((c, i) => (
            <Polaroid key={c.id} character={c} index={i} />
          ))}
        </div>

        <div className={styles.center}>
          <HeroTitle label={t("title")} />
          <p className={styles.tagline}>{t("tagline")}</p>

          <div className={styles.actions}>
            <Button href="/how-to-play" variant="outline" size="lg">
              {t("howToPlay")}
            </Button>
            <Button href="/play" size="lg">
              {t("play")} ▶
            </Button>
          </div>
        </div>

        <div className={styles.cast}>
          {rightCast.map((c, i) => (
            <Polaroid key={c.id} character={c} index={i + 2} />
          ))}
        </div>
      </div>
    </Container>
  );
}

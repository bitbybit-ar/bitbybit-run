import { useLocale, useTranslations } from "next-intl";
import { LogoBlocks } from "@/components/common/logo-blocks/logo-blocks";
import { Wordmark } from "@/components/common/wordmark/wordmark";
import { GithubIcon } from "@/components/icons/github-icon";
import styles from "./footer.module.scss";

export function Footer() {
  const t = useTranslations("footer");
  const studioUrl = `https://bitbybit.com.ar/${useLocale() === "es" ? "es" : "en"}`;

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.identity}>
          <div className={styles.brand}>
            <LogoBlocks />
            <Wordmark />
          </div>
          <p className={styles.credit}>
            {t.rich("credit", {
              studio: (chunks) => (
                <a
                  href={studioUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.link}
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        </div>

        <nav className={styles.links} aria-label={t("ariaLabel")}>
          <a
            href="https://cursats.bitbybit.com.ar"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            {t("cursats")}
          </a>
          <a
            href="https://habits.bitbybit.com.ar"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            {t("habits")}
          </a>
          <a
            href="https://arena.bitbybit.com.ar"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            {t("arena")}
          </a>
          <a
            href="https://github.com/bitbybit-ar/bitbybit-run"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
            aria-label={t("githubAria")}
          >
            <GithubIcon size={16} />
            {t("github")}
          </a>
        </nav>
      </div>
    </footer>
  );
}

export default Footer;

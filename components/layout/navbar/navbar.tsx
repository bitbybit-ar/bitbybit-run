"use client";

import { useTranslations } from "next-intl";
import { Logo } from "@/components/common/logo/logo";
import { LocaleThemeToggle } from "@/components/layout/locale-theme-toggle/locale-theme-toggle";
import { AccountMenu } from "@/components/layout/account-menu/account-menu";
import { Button } from "@/components/ui/button/button";
import { useSignerContext } from "@/lib/contexts/signer-context";
import styles from "./navbar.module.scss";

export function Navbar() {
  const t = useTranslations("nav");
  const { session } = useSignerContext();

  return (
    <nav className={styles.navbar}>
      <div className={styles.inner}>
        <Logo />
        <div className={styles.right}>
          <Button
            href="/leaderboard"
            variant="ghost"
            size="sm"
            aria-label={t("leaderboard")}
          >
            <span aria-hidden="true">🏆</span>
            <span className={styles.navLabel}>{t("leaderboard")}</span>
          </Button>
          <LocaleThemeToggle />
          {session === null ? (
            <Button href="/sign-in" variant="primary" size="sm">
              {t("login")}
            </Button>
          ) : (
            <AccountMenu />
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;

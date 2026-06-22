"use client";

import { useTranslations } from "next-intl";
import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";
import styles from "./offline-banner.module.scss";

/**
 * App-wide connectivity notice. While the browser reports it's offline, a strip
 * appears under the navbar telling the player that practice still works but the
 * multiplayer lobby (which needs the Nostr relays) does not. Renders nothing
 * when online, and nothing on the server / first client render so there's no
 * offline flash during hydration.
 */
export function OfflineBanner() {
  const t = useTranslations("offline");
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <span className={styles.dot} aria-hidden="true" />
      <p className={styles.text}>
        <strong>{t("title")}</strong> {t("body")}
      </p>
    </div>
  );
}

export default OfflineBanner;

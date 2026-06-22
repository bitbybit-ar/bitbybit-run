"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button/button";
import { CloseIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import styles from "./install-app.module.scss";

/**
 * The `beforeinstallprompt` event isn't in the TS DOM lib yet. It's fired by
 * Chromium browsers when the app meets the installability criteria; we keep it
 * and call `prompt()` from our own button instead of the browser's default UI.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa-install-dismissed";
const MOBILE_QUERY = "(max-width: 767px)";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari exposes its own flag instead of the display-mode media query.
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  const ua = window.navigator.userAgent;
  const iOSDevice = /iphone|ipad|ipod/i.test(ua);
  // iPadOS 13+ reports as a Mac; detect it via touch support.
  const iPadOS = /macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  return iOSDevice || iPadOS;
}

/**
 * Mobile-only "Install app" prompt for the PWA.
 *
 * Renders nothing on the server and nothing on desktop — every decision is made
 * client-side after mount, so the desktop experience is byte-for-byte
 * unchanged. On Android/Chromium it captures `beforeinstallprompt` and triggers
 * the native install dialog from our own button. On iOS Safari (which has no
 * such event) it shows a short "Share → Add to Home Screen" hint instead. It
 * stays hidden once the app is installed or after the user dismisses it.
 */
export function InstallApp() {
  const t = useTranslations("installApp");
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    setMounted(true);

    const mobileMql = window.matchMedia(MOBILE_QUERY);
    const syncMobile = () => setIsMobile(mobileMql.matches);
    syncMobile();
    mobileMql.addEventListener("change", syncMobile);

    setInstalled(isStandalone());
    setIos(isIOS());

    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      // localStorage can be unavailable (privacy mode) — treat as not dismissed.
    }

    // Capture the install prompt so we can trigger it from our own button.
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // Hide the bar the moment the app gets installed.
    const onInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      mobileMql.removeEventListener("change", syncMobile);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (ios) {
      setShowIosHint((open) => !open);
      return;
    }
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    // The prompt can only be used once; drop it regardless of the outcome.
    setDeferredPrompt(null);
  }, [ios, deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Ignore — the bar still hides for this session via state.
    }
  }, []);

  // Visible only on mobile, when not installed, not dismissed, and either the
  // browser offered an install prompt (Android) or we're on iOS (manual add).
  const canShow =
    mounted && isMobile && !installed && !dismissed && (deferredPrompt || ios);
  if (!canShow) return null;

  return (
    <div className={styles.wrapper} role="dialog" aria-label={t("ariaLabel")}>
      <div className={styles.bar}>
        <span className={styles.mark} aria-hidden="true" />
        <div className={styles.text}>
          <strong className={styles.title}>{t("title")}</strong>
          <span className={styles.subtitle}>{t("subtitle")}</span>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={handleInstall}
          aria-expanded={ios ? showIosHint : undefined}
        >
          {t("cta")}
        </Button>
        <button
          type="button"
          className={styles.close}
          onClick={handleDismiss}
          aria-label={t("dismiss")}
        >
          <CloseIcon />
        </button>
      </div>
      {ios && showIosHint && (
        <p className={cn(styles.hint, styles.hintOpen)}>{t("iosHint")}</p>
      )}
    </div>
  );
}

export default InstallApp;

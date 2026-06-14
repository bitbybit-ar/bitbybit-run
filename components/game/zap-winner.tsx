"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button/button";
import { Modal } from "@/components/ui/modal";
import { ZAP_SATS, zapLightningAddress } from "@/lib/lightning/zap";
import styles from "./zap-winner.module.scss";

type Status = "idle" | "zapping" | "sent" | "error";

/** Preset amounts (sats) offered in the zap dialog. */
const PRESETS = [21, 100, 1000, 5000] as const;

/** Map a thrown zap error code to a localized message key (with a fallback). */
function errorKeyFor(code: string | null): string {
  return code === "no_webln" ? "zapNoWebln" : "zapFailed";
}

/**
 * "⚡ Zap the winner" — a manual Lightning tip from the viewer's wallet. Clicking
 * opens a dialog where the viewer picks the amount (presets or a custom value),
 * like any Nostr client. Looks up the winner's `lud16` by pubkey and only
 * renders once we know they have one; never shown to the winner themselves
 * (the parent gates that).
 */
export function ZapWinner({
  winnerPubkey,
  winnerName,
}: {
  winnerPubkey: string;
  winnerName: string;
}) {
  const t = useTranslations("play.results");
  const [lud16, setLud16] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number>(ZAP_SATS);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/lud16?pubkey=${winnerPubkey}`)
      .then((r) => r.json())
      .then((d) => {
        if (active) setLud16(typeof d?.lud16 === "string" ? d.lud16 : null);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [winnerPubkey]);

  // No Lightning address: stay silent while loading, then explain why there's
  // nothing to zap (rather than rendering nothing, which reads as a bug).
  if (!lud16) {
    if (!loaded) return null;
    return (
      <p className={styles.note}>{t("zapNoWallet", { name: winnerName })}</p>
    );
  }

  if (status === "sent") {
    return <p className={styles.sent}>{t("zapSent", { name: winnerName })}</p>;
  }

  const suggestions = t.raw("zapMessages") as string[];

  const send = async () => {
    if (!amount || amount <= 0) return;
    setStatus("zapping");
    setErrorCode(null);
    try {
      await zapLightningAddress(lud16, amount, message.trim() || undefined);
      setStatus("sent");
      setOpen(false);
    } catch (err) {
      setErrorCode(err instanceof Error ? err.message : null);
      setStatus("error");
    }
  };

  return (
    <>
      <Button type="button" size="lg" onClick={() => setOpen(true)}>
        {t("zapWinner")}
      </Button>

      {open && (
        <Modal
          onClose={() => setOpen(false)}
          title={t("zapTitle", { name: winnerName })}
          ariaLabel={t("zapTitle", { name: winnerName })}
          size="sm"
        >
          <div className={styles.dialog}>
            <div className={styles.presets}>
              {PRESETS.map((sats) => (
                <button
                  key={sats}
                  type="button"
                  className={styles.preset}
                  aria-pressed={amount === sats}
                  onClick={() => setAmount(sats)}
                >
                  {sats}
                </button>
              ))}
            </div>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t("zapAmountLabel")}</span>
              <input
                className={styles.input}
                type="number"
                min={1}
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
              />
            </label>

            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t("zapMessageLabel")}</span>
              <div className={styles.presets}>
                {suggestions.map((msg) => (
                  <button
                    key={msg}
                    type="button"
                    className={styles.preset}
                    aria-pressed={message === msg}
                    onClick={() => setMessage(msg)}
                  >
                    {msg}
                  </button>
                ))}
              </div>
              <input
                className={styles.input}
                type="text"
                maxLength={200}
                value={message}
                placeholder={t("zapMessagePlaceholder")}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            {status === "error" && (
              <p className={styles.error}>{t(errorKeyFor(errorCode))}</p>
            )}

            <Button
              type="button"
              size="lg"
              onClick={send}
              disabled={status === "zapping" || !amount}
            >
              {status === "zapping"
                ? t("zapping")
                : t("zapSend", { sats: amount })}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

export default ZapWinner;

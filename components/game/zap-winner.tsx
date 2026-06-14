"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button/button";
import { Modal } from "@/components/ui/modal";
import { CheckIcon, CopyIcon, ExternalLinkIcon } from "@/components/icons";
import {
  ZAP_SATS,
  getZapInvoice,
  hasWebln,
  payWithWebln,
} from "@/lib/lightning/zap";
import styles from "./zap-winner.module.scss";

// "invoice" = no wallet (or WebLN pay failed): we show the BOLT11 invoice as a
// QR / copyable string so the viewer can pay from any Lightning wallet.
type Status = "idle" | "zapping" | "sent" | "error" | "invoice";

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
  const [invoice, setInvoice] = useState<string | null>(null);
  // The amount the invoice is actually for (clamped to the recipient's range),
  // which can differ from `amount` the viewer typed.
  const [invoiceSats, setInvoiceSats] = useState<number>(ZAP_SATS);
  const [copied, setCopied] = useState(false);

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
      // Always fetch the invoice first — that part needs no wallet. If WebLN is
      // present, pay it in-browser; otherwise (or if that pay fails) fall back
      // to showing the invoice so the viewer can pay from any wallet.
      const { invoice: inv, sats } = await getZapInvoice(
        lud16,
        amount,
        message.trim() || undefined
      );
      setInvoice(inv);
      setInvoiceSats(sats);
      if (hasWebln()) {
        try {
          await payWithWebln(inv);
          setStatus("sent");
          setOpen(false);
          return;
        } catch {
          // Wallet missing/declined/errored — degrade to the QR fallback
          // rather than dead-ending, since we already have a payable invoice.
        }
      }
      setStatus("invoice");
    } catch (err) {
      setErrorCode(err instanceof Error ? err.message : null);
      setStatus("error");
    }
  };

  const copyInvoice = async () => {
    if (!invoice) return;
    try {
      await navigator.clipboard.writeText(invoice);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Insecure context / no clipboard — the QR is the fallback.
    }
  };

  // Closing resets the transient state so reopening starts at a fresh form
  // (e.g. after viewing the invoice fallback or hitting an error).
  const close = () => {
    setOpen(false);
    setStatus("idle");
    setInvoice(null);
    setErrorCode(null);
    setCopied(false);
  };

  return (
    <>
      <Button type="button" size="lg" onClick={() => setOpen(true)}>
        {t("zapWinner")}
      </Button>

      {open && (
        <Modal
          onClose={close}
          title={t("zapTitle", { name: winnerName })}
          ariaLabel={t("zapTitle", { name: winnerName })}
          size="sm"
        >
          {status === "invoice" && invoice ? (
            <div className={styles.dialog}>
              <p className={styles.note}>
                {t("zapScanToPay", { sats: invoiceSats, name: winnerName })}
              </p>

              <div
                className={styles.qrWrapper}
                role="img"
                aria-label={t("zapQrAlt", { name: winnerName })}
              >
                <QRCodeSVG
                  value={invoice}
                  size={200}
                  level="M"
                  bgColor="transparent"
                  fgColor="currentColor"
                />
              </div>

              <div className={styles.invoiceField}>
                <input
                  type="text"
                  readOnly
                  value={invoice}
                  className={styles.invoiceInput}
                  aria-label={t("zapCopyInvoice")}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  type="button"
                  className={styles.copyBtn}
                  onClick={copyInvoice}
                  aria-label={
                    copied ? t("zapCopiedInvoice") : t("zapCopyInvoice")
                  }
                >
                  {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                </button>
              </div>

              <a href={`lightning:${invoice}`} className={styles.openWallet}>
                <ExternalLinkIcon size={18} />
                {t("zapOpenInWallet")}
              </a>
            </div>
          ) : (
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
                  onChange={(e) =>
                    setAmount(Math.max(0, Number(e.target.value)))
                  }
                />
              </label>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>
                  {t("zapMessageLabel")}
                </span>
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
          )}
        </Modal>
      )}
    </>
  );
}

export default ZapWinner;

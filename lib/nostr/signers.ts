/**
 * Unified signer interface for in-memory Nostr signing.
 *
 * The login flow produces one of three signer types (extension,
 * nsec, nip46). After auth, we keep a `SignerHandle` in memory so
 * subsequent actions (claiming an order, future receipt-DM resends)
 * can be signed without re-prompting the user. None of these handles
 * persist across reloads — see `SignerProvider` for the auto-restore
 * policy.
 */

import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
import type { BunkerSigner } from "nostr-tools/nip46";
import type { NostrEvent, UnsignedNostrEvent } from "./types";
import type { SignerType } from "@/lib/schemas/auth";

export type { SignerType } from "@/lib/schemas/auth";

export interface SignerHandle {
  type: SignerType;
  pubkey: string;
  sign: (event: UnsignedNostrEvent) => Promise<NostrEvent>;
  close?: () => Promise<void>;
}

export function makeExtensionSigner(pubkey: string): SignerHandle {
  return {
    type: "extension",
    pubkey,
    sign: async (event) => {
      if (!window.nostr) throw new Error("no_extension");
      const signed = await window.nostr.signEvent(event);
      return { ...signed, pubkey };
    },
  };
}

export function makeNsecSigner(
  secretKey: Uint8Array,
  pubkey: string
): SignerHandle {
  return {
    type: "nsec",
    pubkey,
    sign: async (event) => {
      const signed = finalizeEvent(event, secretKey);
      return {
        id: signed.id,
        pubkey,
        created_at: signed.created_at,
        kind: signed.kind,
        tags: signed.tags,
        content: signed.content,
        sig: signed.sig,
      };
    },
  };
}

/**
 * A throwaway, in-memory keypair for a single match session — never persisted,
 * never the user's real identity. Used to sign the high-frequency match traffic
 * (runner frames ~5 Hz, finish) locally so a remote signer (Amber/NIP-46) isn't
 * prompted for every frame. The real identity signs the presence/discovery
 * event once, which announces this session key (`sessionKey`) and binds the two;
 * the runner/finish payloads still carry the *real* pubkey in their content, so
 * the roster, standings and leaderboard are unaffected. See docs/MULTIPLAYER.md.
 */
export function makeSessionSigner(): SignerHandle {
  const secretKey = generateSecretKey();
  return makeNsecSigner(secretKey, getPublicKey(secretKey));
}

/**
 * Keep-alive cadence for the NIP-46 relay tunnel. Public relays drop idle
 * connections after a few minutes; a periodic `ping` keeps the channel warm so
 * the bunker is still reachable when the next signature is needed (e.g. after a
 * long lobby wait, or post-race when no presence heartbeat is exercising it).
 */
const NIP46_KEEPALIVE_MS = 150_000;

export function makeNip46Signer(
  bunker: BunkerSigner,
  pubkey: string
): SignerHandle {
  // Ping the bunker on a timer; if the ping fails the tunnel went cold, so try
  // to reconnect now rather than discovering it at sign time. Silent — the
  // reused client key means the remote signer doesn't re-prompt. Guarded for
  // non-browser contexts (SSR/tests without timers).
  const keepalive =
    typeof setInterval !== "undefined"
      ? setInterval(() => {
          void (async () => {
            try {
              await bunker.ping();
            } catch {
              try {
                await bunker.connect();
              } catch {
                // Still down — sign() will retry-with-reconnect on demand.
              }
            }
          })();
        }, NIP46_KEEPALIVE_MS)
      : null;

  return {
    type: "nip46",
    pubkey,
    sign: async (event) => {
      let signed;
      try {
        signed = await bunker.signEvent(event);
      } catch {
        // The relay tunnel can drop during a long wait. Reconnect once and
        // retry — the persisted client key makes the reconnect silent. If the
        // reconnect itself fails it propagates, and the caller (e.g. presence
        // heartbeat) handles it.
        await bunker.connect();
        signed = await bunker.signEvent(event);
      }
      return {
        id: signed.id,
        pubkey: signed.pubkey,
        created_at: signed.created_at,
        kind: signed.kind,
        tags: signed.tags,
        content: signed.content,
        sig: signed.sig,
      };
    },
    close: async () => {
      if (keepalive) clearInterval(keepalive);
      try {
        await bunker.close();
      } catch {
        // Ignore — we're tearing down anyway.
      }
    },
  };
}

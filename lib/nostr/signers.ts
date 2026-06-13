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

import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
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

export function makeNip46Signer(
  bunker: BunkerSigner,
  pubkey: string
): SignerHandle {
  return {
    type: "nip46",
    pubkey,
    sign: async (event) => {
      const signed = await bunker.signEvent(event);
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
      try {
        await bunker.close();
      } catch {
        // Ignore — we're tearing down anyway.
      }
    },
  };
}

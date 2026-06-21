// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mutable handle the fake BunkerSigner reports as its restored identity, plus
// spies the tests assert on. `vi.hoisted` so the vi.mock factory can close over
// them (mock factories are hoisted above imports).
const h = vi.hoisted(() => ({
  reportedPubkey: "",
  connectFailsWith: null as Error | null,
  closeSpy: vi.fn(),
}));

vi.mock("nostr-tools/nip46", async (importOriginal) => {
  const actual = await importOriginal<typeof import("nostr-tools/nip46")>();
  class FakeBunkerSigner {
    constructor(public bp: unknown) {}
    static fromBunker(_clientKey: Uint8Array, bp: unknown) {
      return new FakeBunkerSigner(bp);
    }
    async connect() {
      if (h.connectFailsWith) throw h.connectFailsWith;
    }
    async getPublicKey() {
      return h.reportedPubkey;
    }
    async signEvent(e: Record<string, unknown>) {
      return { ...e, id: "id", sig: "sig", pubkey: h.reportedPubkey };
    }
    async close() {
      h.closeSpy();
    }
  }
  return { ...actual, BunkerSigner: FakeBunkerSigner };
});

import {
  persistBunkerPointer,
  clearBunkerPointer,
  restoreNip46Signer,
} from "@/lib/nostr/nip46-login";

const PUBKEY = "a".repeat(64);
const POINTER = { relays: ["wss://relay.example"], pubkey: PUBKEY, secret: null };

// Minimal in-memory localStorage — the suite runs in the node environment,
// where there's no DOM, but nip46-login only needs get/set/remove.
function installLocalStorage() {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
  return store;
}

describe("nip46-login auto-restore", () => {
  beforeEach(() => {
    installLocalStorage();
    h.reportedPubkey = PUBKEY;
    h.connectFailsWith = null;
    h.closeSpy.mockClear();
  });

  it("returns null when no pointer was persisted", async () => {
    expect(await restoreNip46Signer(PUBKEY)).toBeNull();
  });

  it("rebuilds a nip46 signer from the persisted pointer", async () => {
    persistBunkerPointer(POINTER);
    const signer = await restoreNip46Signer(PUBKEY);
    expect(signer).not.toBeNull();
    expect(signer?.type).toBe("nip46");
    expect(signer?.pubkey).toBe(PUBKEY);
  });

  it("rejects and clears the pointer when the restored identity mismatches", async () => {
    persistBunkerPointer(POINTER);
    h.reportedPubkey = "b".repeat(64); // bunker now reports a different key
    expect(await restoreNip46Signer(PUBKEY)).toBeNull();
    expect(h.closeSpy).toHaveBeenCalled();
    // Pointer was cleared, so a second attempt finds nothing to restore.
    h.reportedPubkey = PUBKEY;
    expect(await restoreNip46Signer(PUBKEY)).toBeNull();
  });

  it("returns null when the bunker connection fails", async () => {
    persistBunkerPointer(POINTER);
    h.connectFailsWith = new Error("relay down");
    expect(await restoreNip46Signer(PUBKEY)).toBeNull();
  });

  it("clearBunkerPointer prevents a later restore", async () => {
    persistBunkerPointer(POINTER);
    clearBunkerPointer();
    expect(await restoreNip46Signer(PUBKEY)).toBeNull();
  });
});

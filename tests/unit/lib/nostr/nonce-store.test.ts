// @vitest-environment node
import { describe, it, expect } from "vitest";
import { claimNonce } from "@/lib/nostr/nonce-store";

describe("claimNonce (NIP-98 anti-replay)", () => {
  it("honors an id once, then rejects a replay within the window", () => {
    const id = `e${Math.random()}`;
    const t0 = 1_000_000;
    expect(claimNonce(id, t0)).toBe(true); // first use
    expect(claimNonce(id, t0 + 100)).toBe(false); // replay
  });

  it("allows the id again once its window has elapsed", () => {
    const id = `e${Math.random()}`;
    const t0 = 2_000_000;
    expect(claimNonce(id, t0)).toBe(true);
    expect(claimNonce(id, t0 + 61_000)).toBe(true); // past TTL → fresh
  });

  it("tracks distinct ids independently", () => {
    const t0 = 3_000_000;
    expect(claimNonce(`a${Math.random()}`, t0)).toBe(true);
    expect(claimNonce(`b${Math.random()}`, t0)).toBe(true);
  });
});

// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import type { BunkerSigner } from "nostr-tools/nip46";
import { makeNip46Signer } from "@/lib/nostr/signers";

const PUBKEY = "a".repeat(64);

const EVENT = {
  kind: 1,
  created_at: 0,
  tags: [],
  content: "",
};

function signed() {
  return {
    id: "id",
    pubkey: PUBKEY,
    created_at: 0,
    kind: 1,
    tags: [],
    content: "",
    sig: "sig",
  };
}

/** Minimal BunkerSigner stand-in — only the methods makeNip46Signer touches. */
function fakeBunker(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    signEvent: vi.fn(async () => signed()),
    connect: vi.fn(async () => {}),
    ping: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    ...overrides,
  } as unknown as BunkerSigner & {
    signEvent: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    ping: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
}

describe("makeNip46Signer", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("signs through the bunker on the happy path", async () => {
    const bunker = fakeBunker();
    const signer = makeNip46Signer(bunker, PUBKEY);
    const out = await signer.sign(EVENT);
    expect(out.sig).toBe("sig");
    expect(bunker.signEvent).toHaveBeenCalledTimes(1);
    expect(bunker.connect).not.toHaveBeenCalled();
    await signer.close?.();
  });

  it("reconnects once and retries when the first sign fails", async () => {
    const signEvent = vi
      .fn()
      .mockRejectedValueOnce(new Error("tunnel dropped"))
      .mockResolvedValueOnce(signed());
    const bunker = fakeBunker({ signEvent });
    const signer = makeNip46Signer(bunker, PUBKEY);

    const out = await signer.sign(EVENT);
    expect(out.sig).toBe("sig");
    expect(bunker.connect).toHaveBeenCalledTimes(1);
    expect(signEvent).toHaveBeenCalledTimes(2);
    await signer.close?.();
  });

  it("propagates when the reconnect also fails", async () => {
    const bunker = fakeBunker({
      signEvent: vi.fn().mockRejectedValue(new Error("down")),
      connect: vi.fn().mockRejectedValue(new Error("relay unreachable")),
    });
    const signer = makeNip46Signer(bunker, PUBKEY);
    await expect(signer.sign(EVENT)).rejects.toThrow("relay unreachable");
    await signer.close?.();
  });

  it("pings to keep the tunnel warm and stops on close", async () => {
    vi.useFakeTimers();
    const bunker = fakeBunker();
    const signer = makeNip46Signer(bunker, PUBKEY);

    await vi.advanceTimersByTimeAsync(150_000);
    expect(bunker.ping).toHaveBeenCalledTimes(1);

    await signer.close?.();
    expect(bunker.close).toHaveBeenCalled();

    // No more pings fire after close.
    await vi.advanceTimersByTimeAsync(300_000);
    expect(bunker.ping).toHaveBeenCalledTimes(1);
  });

  it("reconnects from the keep-alive when a ping fails", async () => {
    vi.useFakeTimers();
    const bunker = fakeBunker({
      ping: vi.fn().mockRejectedValue(new Error("cold")),
    });
    const signer = makeNip46Signer(bunker, PUBKEY);

    await vi.advanceTimersByTimeAsync(150_000);
    expect(bunker.ping).toHaveBeenCalledTimes(1);
    expect(bunker.connect).toHaveBeenCalledTimes(1);
    await signer.close?.();
  });
});

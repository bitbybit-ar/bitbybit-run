// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { postMatchResult } from "@/lib/multiplayer/persist-result";
import type { PersistMatchInput } from "@/lib/schemas/match";

const BODY: PersistMatchInput = {
  nostrId: "bbr-match-1",
  trackId: "track-1",
  host: "a".repeat(64),
  startedAt: 0,
  standings: [
    { pubkey: "a".repeat(64), position: 1, points: 10, finishTime: null },
  ],
};

const ok = () => ({ ok: true, status: 200 }) as Response;
const status = (s: number) => ({ ok: false, status: s }) as Response;

// Immediate sleep so retries don't add real delay.
const noSleep = () => Promise.resolve();

describe("postMatchResult", () => {
  it("returns true on a first successful post", async () => {
    const fetchImpl = vi.fn(async () => ok());
    const result = await postMatchResult(BODY, { fetchImpl, sleep: noSleep });
    expect(result).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("posts to /api/matches with a JSON body", async () => {
    const fetchImpl = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) => ok()
    );
    await postMatchResult(BODY, { fetchImpl, sleep: noSleep });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/matches");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string).nostrId).toBe("bbr-match-1");
  });

  it("retries a 5xx and succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(status(502))
      .mockResolvedValueOnce(ok());
    const result = await postMatchResult(BODY, { fetchImpl, sleep: noSleep });
    expect(result).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries a network error and succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(ok());
    const result = await postMatchResult(BODY, { fetchImpl, sleep: noSleep });
    expect(result).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries a 429 rate-limit", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(status(429))
      .mockResolvedValueOnce(ok());
    const result = await postMatchResult(BODY, { fetchImpl, sleep: noSleep });
    expect(result).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry a permanent 4xx (422)", async () => {
    const fetchImpl = vi.fn(async () => status(422));
    const result = await postMatchResult(BODY, { fetchImpl, sleep: noSleep });
    expect(result).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 401 (session the server won't accept)", async () => {
    const fetchImpl = vi.fn(async () => status(401));
    const result = await postMatchResult(BODY, { fetchImpl, sleep: noSleep });
    expect(result).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting retries (retries + 1 attempts)", async () => {
    const fetchImpl = vi.fn(async () => status(500));
    const result = await postMatchResult(BODY, {
      fetchImpl,
      sleep: noSleep,
      retries: 2,
    });
    expect(result).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

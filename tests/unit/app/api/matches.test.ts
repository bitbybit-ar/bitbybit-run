// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock the route's collaborators so we exercise only the handler's auth /
// validation / participant / error branches (not the DB or real session).
const getSession = vi.fn();
const persistMatchResult = vi.fn();

vi.mock("@/lib/auth", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/multiplayer/store", () => ({
  persistMatchResult: (input: unknown) => persistMatchResult(input),
}));

import { POST } from "@/app/api/matches/route";

const SELF = "a".repeat(64);
const RIVAL = "b".repeat(64);

let ip = 0;
function post(body: unknown): NextRequest {
  // A fresh IP per request so the (real) rate limiter never interferes.
  return new NextRequest("https://x.test/api/matches", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${ip++}` },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validBody = {
  nostrId: "bbr-deadbeef-1700000000000",
  trackId: "classic-v1",
  host: SELF,
  startedAt: 1700000000000,
  standings: [
    { pubkey: SELF, position: 1, points: 520, finishTime: 100 },
    { pubkey: RIVAL, position: 2, points: 400, finishTime: null },
  ],
};

describe("POST /api/matches", () => {
  beforeEach(() => {
    getSession.mockReset();
    persistMatchResult.mockReset();
  });

  it("401 when not signed in", async () => {
    getSession.mockResolvedValue(null);
    const res = await POST(post(validBody));
    expect(res.status).toBe(401);
  });

  it("400 on malformed JSON", async () => {
    getSession.mockResolvedValue({ pubkey: SELF });
    const res = await POST(post("{not json"));
    expect(res.status).toBe(400);
  });

  it("422 when the body fails the schema (out-of-range points)", async () => {
    getSession.mockResolvedValue({ pubkey: SELF });
    const bad = {
      ...validBody,
      standings: [{ pubkey: SELF, position: 1, points: 1e9, finishTime: 100 }],
    };
    const res = await POST(post(bad));
    expect(res.status).toBe(422);
    expect(persistMatchResult).not.toHaveBeenCalled();
  });

  it("403 when the submitter isn't one of the players", async () => {
    getSession.mockResolvedValue({ pubkey: "c".repeat(64) });
    const res = await POST(post(validBody));
    expect(res.status).toBe(403);
    expect(persistMatchResult).not.toHaveBeenCalled();
  });

  it("200 and persists when a participant submits a valid match", async () => {
    getSession.mockResolvedValue({ pubkey: SELF });
    persistMatchResult.mockResolvedValue("match-id-1");
    const res = await POST(post(validBody));
    expect(res.status).toBe(200);
    expect(persistMatchResult).toHaveBeenCalledOnce();
    await expect(res.json()).resolves.toMatchObject({ ok: true });
  });

  it("502 when persistence throws", async () => {
    getSession.mockResolvedValue({ pubkey: SELF });
    persistMatchResult.mockRejectedValue(new Error("db down"));
    const res = await POST(post(validBody));
    expect(res.status).toBe(502);
  });
});

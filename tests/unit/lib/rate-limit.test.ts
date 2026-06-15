// @vitest-environment node
import { describe, it, expect } from "vitest";
import { rateLimit } from "@/lib/rate-limit";

describe("rateLimit", () => {
  it("allows up to the limit, then blocks within the window", () => {
    const key = `t1-${Math.random()}`;
    const t0 = 1_000_000;
    // 3 allowed
    expect(rateLimit(key, 3, 1000, t0).ok).toBe(true);
    expect(rateLimit(key, 3, 1000, t0 + 10).ok).toBe(true);
    expect(rateLimit(key, 3, 1000, t0 + 20).ok).toBe(true);
    // 4th blocked, with a positive retry-after
    const blocked = rateLimit(key, 3, 1000, t0 + 30);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("resets after the window elapses", () => {
    const key = `t2-${Math.random()}`;
    const t0 = 2_000_000;
    expect(rateLimit(key, 1, 1000, t0).ok).toBe(true);
    expect(rateLimit(key, 1, 1000, t0 + 500).ok).toBe(false); // still in window
    expect(rateLimit(key, 1, 1000, t0 + 1001).ok).toBe(true); // window rolled over
  });

  it("tracks distinct keys independently", () => {
    const a = `t3a-${Math.random()}`;
    const b = `t3b-${Math.random()}`;
    const t0 = 3_000_000;
    expect(rateLimit(a, 1, 1000, t0).ok).toBe(true);
    expect(rateLimit(a, 1, 1000, t0).ok).toBe(false);
    // a different key has its own budget
    expect(rateLimit(b, 1, 1000, t0).ok).toBe(true);
  });
});

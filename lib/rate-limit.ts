import "server-only";

import { NextResponse, type NextRequest } from "next/server";

/**
 * Tiny in-memory fixed-window rate limiter for API routes.
 *
 * IMPORTANT scope: this only guards our own Next.js API routes (login, profile
 * sync, match persist, lud16 lookup). It does NOT touch the realtime
 * multiplayer path — runner frames, presence, and lobby discovery go straight
 * from the browser to the Nostr relays and never hit this server — so the
 * "we call the relays a lot" flows are completely unaffected. The limits below
 * are deliberately generous: they only catch abusive bursts, not real play.
 *
 * The counter lives in process memory (per instance), which blunts abusive
 * bursts and accidental loops without extra infrastructure.
 */

interface Window {
  count: number;
  resetAt: number; // unix ms when the window rolls over
}

const windows = new Map<string, Window>();
let lastSweep = 0;

/** Drop expired windows occasionally so the map can't grow unbounded. */
function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, w] of windows) {
    if (now >= w.resetAt) windows.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets (only meaningful when `ok` is false). */
  retryAfter: number;
}

/**
 * Allow up to `limit` hits per `windowMs` for `key`. Pure and synchronous —
 * unit-testable without a request.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
): RateLimitResult {
  sweep(now);
  const w = windows.get(key);
  if (!w || now >= w.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (w.count < limit) {
    w.count += 1;
    return { ok: true, retryAfter: 0 };
  }
  return {
    ok: false,
    retryAfter: Math.max(1, Math.ceil((w.resetAt - now) / 1000)),
  };
}

/** Best-effort client IP from the proxy headers (Vercel sets these). */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Enforce a per-IP limit for a route. Returns a ready-to-send 429 (with
 * `Retry-After`) when exceeded, or `null` to proceed. `scope` namespaces the
 * counter so different routes don't share a budget.
 */
export function enforceRateLimit(
  req: NextRequest,
  scope: string,
  limit: number,
  windowMs: number
): NextResponse | null {
  const { ok, retryAfter } = rateLimit(
    `${scope}:${clientIp(req)}`,
    limit,
    windowMs
  );
  if (ok) return null;
  return NextResponse.json(
    { error: "rate_limited" },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

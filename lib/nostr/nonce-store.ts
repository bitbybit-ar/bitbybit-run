import "server-only";

/**
 * Single-use guard for NIP-98 auth events (anti-replay).
 *
 * The login route accepts a signed event whose `created_at` is within a ±10s
 * window. Without this, a captured `Authorization: Nostr …` header could be
 * replayed within that window to mint a second session for the same pubkey.
 * We remember each event id we've honored until its window has surely passed,
 * and reject a repeat.
 *
 * Best-effort, like the rate limiter: the set lives in process memory, so on
 * serverless it's per-instance (a replay routed to a different instance within
 * the window could still slip through). It closes the common case without new
 * infrastructure; a hard guarantee needs a shared store — see docs/AUDIT.md §1.
 */

// Keep ids a bit longer than the validation window so a replay can't outlast
// the memory of it (the event itself is rejected as too-old past ~10s anyway).
const TTL_MS = 60_000;

const seen = new Map<string, number>(); // event id → expiry (unix ms)
let lastSweep = 0;

function sweep(now: number): void {
  if (now - lastSweep < TTL_MS) return;
  lastSweep = now;
  for (const [id, expiry] of seen) {
    if (now >= expiry) seen.delete(id);
  }
}

/**
 * Record `id` as used; returns false if it was already used (a replay).
 * `id` is the Nostr event id (a 64-char hex sha256 of the event).
 */
export function claimNonce(id: string, now: number = Date.now()): boolean {
  sweep(now);
  const expiry = seen.get(id);
  if (expiry !== undefined && now < expiry) return false;
  seen.set(id, now + TTL_MS);
  return true;
}

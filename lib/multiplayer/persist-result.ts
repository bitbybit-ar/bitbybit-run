/**
 * Client-side helper to persist a finished match's standings to the leaderboard
 * (`POST /api/matches`), with bounded retry.
 *
 * The live race is peer-to-peer over Nostr; when a client sees the match finish
 * it posts the standings here. Every remaining participant posts (idempotent on
 * `nostrId`), but a transient network blip on that single fire-and-forget call
 * used to drop the result silently — a race you played that never showed up on
 * the leaderboard. So retry network/5xx failures a few times with backoff.
 * Permanent client errors (4xx other than 429) won't change on retry, so we
 * stop immediately.
 *
 * Split out of the React hook (`usePersistOnFinish`) so it can be unit-tested
 * node-side with an injected fetch + sleep.
 */
import type { PersistMatchInput } from "@/lib/schemas/match";

const BASE_BACKOFF_MS = 1_000;
const DEFAULT_RETRIES = 3;

export interface PostMatchResultDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Extra attempts after the first (so total tries = retries + 1). */
  retries?: number;
}

export async function postMatchResult(
  body: PersistMatchInput,
  deps: PostMatchResultDeps = {}
): Promise<boolean> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const retries = deps.retries ?? DEFAULT_RETRIES;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl("/api/matches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return true;
      // 4xx (except 429 rate-limit) is a permanent rejection — a bad body, or a
      // session the server won't accept. Retrying won't help.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        return false;
      }
      // 5xx / 429 → fall through to backoff + retry.
    } catch {
      // Network error → fall through to backoff + retry.
    }
    if (attempt < retries) {
      await sleep(BASE_BACKOFF_MS * 2 ** attempt);
    }
  }
  return false;
}

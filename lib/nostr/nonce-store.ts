import "server-only";

import { lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { authNonces } from "@/lib/db/schema";

/**
 * Single-use guard for NIP-98 auth events (anti-replay).
 *
 * The login route accepts a signed event whose `created_at` is within a ±10s
 * window. Without this, a captured `Authorization: Nostr …` header could be
 * replayed within that window to mint a second session for the same pubkey.
 * We record each event id we've honored and reject a repeat.
 *
 * The record lives in Postgres (`auth_nonces`), **not** process memory, so it
 * holds across Vercel's serverless instances and cold starts — an in-memory
 * `Set` would only guard a single lambda, letting a replay slip through on a
 * different instance. Login is infrequent (and already hits the DB for the user
 * row), so the extra round-trip is negligible.
 */

// Keep ids a bit longer than the validation window so a replay can't outlast
// the memory of it (the event itself is rejected as too-old past ~10s anyway).
const TTL_MS = 60_000;

/**
 * Record `id` as used; resolves false if it was already used (a replay).
 * `id` is the Nostr event id (a 64-char hex sha256 of the event).
 *
 * Implemented as an idempotent insert: `ON CONFLICT DO NOTHING` writes no row
 * for a repeat id, so an empty `returning()` is the replay signal. Expired rows
 * are swept first — login is rare, so the extra indexed delete keeps the table
 * self-cleaning without a cron.
 */
export async function claimNonce(
  id: string,
  now: number = Date.now()
): Promise<boolean> {
  const db = getDb();
  await db.delete(authNonces).where(lt(authNonces.expires_at, new Date(now)));
  const inserted = await db
    .insert(authNonces)
    .values({ id, expires_at: new Date(now + TTL_MS) })
    .onConflictDoNothing({ target: authNonces.id })
    .returning({ id: authNonces.id });
  return inserted.length > 0;
}

import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { PersistMatchSchema } from "@/lib/schemas/match";
import { persistMatchResult } from "@/lib/multiplayer/store";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * Persist a finished match's standings for the leaderboard.
 *
 * The live race runs over Nostr with no server; when a client sees the match
 * finish it POSTs the final standings here. Client-authoritative (no
 * anti-cheat) — an accepted MVP tradeoff (see ARCHITECTURE §10) — so we only
 * require that the submitter is one of the match's players. Any participant may
 * post (not just the host), so a match isn't lost when the host leaves before
 * it resolves; keyed by `nostrId` the write is idempotent, so concurrent or
 * retried posts from several clients never duplicate a match.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Generous: a finished match has up to 4 players each POSTing once
  // (idempotent), plus a few matches per minute — 60/min/IP only catches spam.
  const limited = enforceRateLimit(req, "matches", 60, 60_000);
  if (limited) return limited;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = PersistMatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 422 });
  }
  const match = parsed.data;

  // The submitter must be one of the match's players (host or any participant).
  const isParticipant = match.standings.some((s) => s.pubkey === session.pubkey);
  if (!isParticipant) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const id = await persistMatchResult({
      nostrId: match.nostrId,
      trackId: match.trackId,
      hostPubkey: match.host,
      startedAt: match.startedAt != null ? new Date(match.startedAt) : null,
      standings: match.standings,
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.warn(
      `[matches] persist failed for ${match.nostrId}:`,
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: "persist_failed" }, { status: 502 });
  }
}

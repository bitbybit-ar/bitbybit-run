import { NextResponse, type NextRequest } from "next/server";
import { NostrPubkeySchema } from "@/lib/schemas/primitives";
import { getUserByPubkey } from "@/lib/creator/users";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * Look up a player's Lightning address (`lud16`) by pubkey so the results
 * screen can offer a "zap the winner" tip. Public info (lud16 lives in the
 * user's Nostr kind:0 profile), so no auth — returns null when unset.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  // Throttle pubkey enumeration; high enough for normal results-screen lookups.
  const limited = enforceRateLimit(req, "lud16", 120, 60_000);
  if (limited) return limited;

  const parsed = NostrPubkeySchema.safeParse(
    req.nextUrl.searchParams.get("pubkey")
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_pubkey" }, { status: 400 });
  }

  try {
    const user = await getUserByPubkey(parsed.data);
    return NextResponse.json({ lud16: user?.lud16 ?? null });
  } catch {
    // No DB / lookup failure — degrade gracefully (no zap button shown).
    return NextResponse.json({ lud16: null });
  }
}

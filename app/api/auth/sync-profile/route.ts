import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { fetchKind0Profile } from "@/lib/nostr/profile";
import { syncUserFromKind0 } from "@/lib/creator/users";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * Manual "sync profile from Nostr". Re-fetches the signed-in user's
 * kind:0 metadata and overwrites name/avatar/lightning on their row —
 * Nostr is the source of truth (there's no in-app profile editor).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Each call fans out to relays (~6s), so this is the priciest route — but
  // it's a manual user action. 10/min/IP is plenty for legit use.
  const limited = enforceRateLimit(req, "sync-profile", 10, 60_000);
  if (limited) return limited;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const profile = await fetchKind0Profile(session.pubkey);
    const user = await syncUserFromKind0(session.pubkey, profile);
    if (!user) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        slug: user.slug,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        lud16: user.lud16,
      },
    });
  } catch (err) {
    console.warn(
      `[auth/sync-profile] failed for ${session.pubkey}:`,
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: "sync_failed" }, { status: 502 });
  }
}

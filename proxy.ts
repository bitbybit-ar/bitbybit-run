import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from "@/lib/auth-constants";
import { createSessionToken, verifySessionToken } from "@/lib/session-jwt";

// Next.js 16 middleware (renamed `proxy.ts`). Handles locale negotiation and
// prefixing for next-intl, and re-mints the session cookie on navigation so the
// session is a rolling window (see `SESSION_TTL_DAYS`). Kept minimal — no CSP
// layer yet.
const intlMiddleware = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  const response = intlMiddleware(request);

  // Rolling session: every page navigation re-mints the JWT with a fresh
  // `SESSION_TTL_DAYS` clock, so an active user effectively never gets logged
  // out — a long match (including waiting in the lobby) can't outlive it. We
  // only re-mint a cookie that still verifies; an expired/forged one is left
  // alone (the `/api/auth/session` probe drops it). Verify failures are
  // swallowed so a transient secret/parse error never breaks navigation.
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    try {
      const session = await verifySessionToken(token);
      if (session) {
        const fresh = await createSessionToken({
          pubkey: session.pubkey,
          locale: session.locale,
          signer_type: session.signer_type,
        });
        response.cookies.set(SESSION_COOKIE_NAME, fresh, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: SESSION_TTL_SECONDS,
          path: "/",
        });
      }
    } catch {
      // Leave the cookie untouched on any verify/sign error.
    }
  }

  return response;
}

export const config = {
  // Run on everything except API routes, Next internals, and static files.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};

import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/auth-constants";
import {
  createSessionToken,
  verifySessionToken,
  type AuthSession,
  type SessionPayload,
} from "@/lib/session-jwt";

export { SESSION_COOKIE_NAME };
export { verifySessionToken };
export type { AuthSession };

/**
 * Mint a signed session JWT. Thin re-export of the edge-safe
 * `createSessionToken` under the historical name server callers use.
 */
export async function createSession(payload: SessionPayload): Promise<string> {
  return createSessionToken(payload);
}

export async function getSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  return verifySessionToken(token);
}

/**
 * Has-cookie / verified-session probe. Lets the layout and the
 * `/api/auth/session` route both detect the "cookie present but
 * JWT no longer verifies" state so they can drop the stale cookie
 * instead of leaving the browser to keep sending it on every
 * request until natural expiry.
 */
export async function readSessionCookieAndVerify(): Promise<{
  hasCookie: boolean;
  session: AuthSession | null;
}> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return { hasCookie: false, session: null };
  const session = await verifySessionToken(token);
  return { hasCookie: true, session };
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  // Overwrite with an expired cookie using the SAME attributes it was
  // set with — a bare `delete(name)` doesn't reliably clear a cookie
  // set with `secure`/`sameSite`, leaving a valid session that bounces
  // the user straight back out of /sign-in.
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

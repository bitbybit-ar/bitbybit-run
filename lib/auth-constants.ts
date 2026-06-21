/**
 * Shared constants for auth. Kept in its own file so the edge proxy
 * (`proxy.ts`) can import without pulling in
 * `next/headers`, which the edge runtime rejects. `lib/auth.ts`
 * re-exports these so server callers can keep the single import path.
 */

/**
 * Session cookie name. The `__Host-` prefix is enforced by the
 * browser: the cookie is rejected unless it's marked Secure, has
 * `Path=/`, and has no `Domain` attribute — blocking subdomain
 * cookie injection from any future `*.bitbybit.com.ar` service.
 * Renaming this constant invalidates every outstanding session.
 *
 * In dev (`NODE_ENV !== "production"`), `__Host-` won't work because
 * the cookie can't be Secure over plain HTTP. Fall back to a plain
 * name so local dev keeps working.
 */
export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Host-session" : "session";

/**
 * Session lifetime, in days. The cookie is a rolling window: every page
 * navigation through `proxy.ts` re-mints the JWT with a fresh
 * `SESSION_TTL_DAYS` clock (see the re-mint in `proxy.ts`), so an active
 * user effectively never gets logged out — while an abandoned session
 * lapses this many days after the last visit and the user is bounced to
 * `/sign-in` on their next click.
 *
 * A week (not an hour) so a long match — including waiting in the lobby
 * for opponents — can never outlive the session.
 */
export const SESSION_TTL_DAYS = 7;

/** Same lifetime in seconds, for cookie `maxAge`. */
export const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;

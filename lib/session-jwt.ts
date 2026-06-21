/**
 * Edge-safe session JWT helpers — sign + verify only, no `next/headers`.
 *
 * Split out of `lib/auth.ts` so the edge middleware (`proxy.ts`) can
 * re-mint the rolling session cookie on navigation without dragging in
 * `cookies()` (which the edge runtime rejects). `lib/auth.ts` re-exports
 * these so server callers keep their single import path.
 */
import { SignJWT, jwtVerify } from "jose";
import { getAuthSecret } from "@/lib/env";
import { SESSION_TTL_DAYS } from "@/lib/auth-constants";
import {
  LocaleSchema,
  SignerTypeSchema,
  type Locale,
  type SignerType,
} from "@/lib/schemas/auth";

const SESSION_DURATION = `${SESSION_TTL_DAYS}d` as const;

/**
 * The session payload that lives inside the signed JWT cookie.
 *
 * Notice what is *not* here:
 *
 * - There is no user id, display name, or avatar embedded in the
 *   JWT — the pubkey IS the identity (ADR 0007). The `users` row
 *   (ADR 0016) is looked up at request time via
 *   `lib/creator/users.getUserByPubkey`, so deactivating a user
 *   revokes their access immediately without waiting for the JWT
 *   to expire.
 */
export interface AuthSession {
  pubkey: string;
  locale: Locale;
  /** null when the JWT was issued before signer_type was tracked. */
  signer_type: SignerType | null;
}

export interface SessionPayload {
  pubkey: string;
  locale: Locale;
  signer_type?: SignerType | null;
}

export async function createSessionToken(
  payload: SessionPayload
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(getAuthSecret());
}

/**
 * Pure JWT verification — no `next/headers` dependency. Lets the edge
 * middleware (`proxy.ts`) reuse the same logic without dragging in
 * cookies(), and makes the unit tests trivial.
 */
export async function verifySessionToken(
  token: string
): Promise<AuthSession | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    const p = payload as unknown as SessionPayload;
    if (!p.pubkey) return null;
    const locale = LocaleSchema.safeParse(p.locale).success
      ? (p.locale as Locale)
      : "es";
    const signerType =
      p.signer_type && SignerTypeSchema.safeParse(p.signer_type).success
        ? p.signer_type
        : null;
    return { pubkey: p.pubkey, locale, signer_type: signerType };
  } catch {
    return null;
  }
}

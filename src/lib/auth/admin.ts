import "server-only";
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Minimal admin auth: one shared credential for the XAYVEN team (no
 * multi-user accounts yet — that belongs to the future client portal, see
 * README "V1.2 / future"). No password is ever hardcoded: the hash lives in
 * ADMIN_PASSWORD_HASH (generate it with `node scripts/hash-password.mjs`),
 * and sessions are a signed, stateless cookie (HMAC'd with
 * ADMIN_SESSION_SECRET) rather than a server-side session store.
 */

export const SESSION_COOKIE = "xayven_admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

export function isAdminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD_HASH && process.env.ADMIN_SESSION_SECRET);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, key] = storedHash.split(":");
  if (!salt || !key) return false;

  const derived = scryptSync(password, salt, 64);
  const keyBuffer = Buffer.from(key, "hex");
  if (derived.length !== keyBuffer.length) return false;

  return timingSafeEqual(derived, keyBuffer);
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function createSessionToken(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return null;

  const expires = Date.now() + SESSION_TTL_MS;
  const payload = String(expires);
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || !token) return false;

  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;

  const expected = sign(payload, secret);
  const sigBuf = Buffer.from(sig, "hex");
  const expBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return false;

  const expires = Number(payload);
  return Number.isFinite(expires) && expires > Date.now();
}

export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;

/** Guard for API routes under /api/admin/** — checks the same signed
 *  cookie the (protected) layout checks for pages. */
export async function requireAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

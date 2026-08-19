import "server-only";
import type { NextRequest } from "next/server";

/**
 * In-memory sliding-window rate limiter. Good enough for a single Node
 * server instance (which is how this project is deployed today); if XAYVEN
 * ever runs multiple instances behind a load balancer, swap this module for
 * a shared store (e.g. Upstash Redis) without touching call sites — see
 * README "Security" section.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Periodically forget stale buckets so this map can't grow unbounded.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let lastSweep = Date.now();
function sweep() {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}

// Private/internal ranges (RFC 1918 IPv4 + loopback + link-local + IPv6
// unique-local/link-local). A value in one of these ranges is never a real
// visitor's address — at best it's an internal hop of our own hosting
// infrastructure, and trusting it would silently merge every visitor behind
// that hop into one shared rate-limit bucket.
const PRIVATE_IP_PATTERNS = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^127\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^f[cd][0-9a-f]{2}:/i,
  /^fe80:/i,
];

function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(ip));
}

/**
 * Extracts the best-effort real client IP from proxy headers, without ever
 * trusting a fixed position blindly.
 *
 * Neither `X-Forwarded-For` nor `X-Real-IP` are cryptographically
 * trustworthy — a client can send either directly, and we have no confirmed
 * documentation of exactly how Hostinger's edge (or any proxy in front of
 * this app) rewrites them. Given that uncertainty, this prefers whichever
 * candidate actually looks like a real, public, non-internal address:
 *   1. `X-Real-IP`, if it's a plausible public IP.
 *   2. `X-Forwarded-For`, walked from the RIGHT — the end a well-behaved
 *      proxy appends to, as opposed to the left end a client fully
 *      controls — looking for the first public IP.
 *   3. If nothing public is found, the first available candidate (still
 *      useful for grouping abusive traffic together) rather than blindly
 *      returning "unknown".
 * This deliberately never picks a private/internal address, which is what
 * would otherwise risk merging many distinct legitimate visitors behind a
 * shared internal hop into a single rate-limit bucket.
 *
 * Factored out (XAYVEN CORE Phase 3.1) into a header-getter-agnostic core
 * so the exact same logic can run against either a real `NextRequest`
 * (`getClientIp`, all existing callers, unchanged) or a `next/headers`
 * `headers()` result (`getClientIpFromHeaders`, used by
 * commercialContext.ts's geo-IP market detection — Server Components have
 * no `NextRequest` to read, only `headers()`). Neither the signature nor
 * the behavior of `getClientIp()` itself changes for any of its ~25
 * existing callers.
 */
function extractClientIp(getHeader: (name: string) => string | null | undefined): string {
  const candidates: string[] = [];

  const realIp = getHeader("x-real-ip")?.trim();
  if (realIp) candidates.push(realIp);

  const forwarded = getHeader("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .reverse();
    candidates.push(...parts);
  }

  const firstPublic = candidates.find((ip) => !isPrivateIp(ip));
  if (firstPublic) return firstPublic;

  return candidates[0] ?? "unknown";
}

export function getClientIp(request: NextRequest): string {
  return extractClientIp((name) => request.headers.get(name));
}

/** Same extraction logic as `getClientIp()`, against a `next/headers`
 *  `headers()`-shaped object instead of a `NextRequest` — see the doc
 *  comment above `extractClientIp()`. */
export function getClientIpFromHeaders(headerList: { get(name: string): string | null }): string {
  return extractClientIp((name) => headerList.get(name));
}

/**
 * Returns true if the request is allowed, false if it should be rejected
 * with 429. `key` should combine a namespace (route name) with an
 * identifier (IP, session id, …).
 */
export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): { allowed: boolean; retryAfterSeconds: number } {
  sweep();
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Wompi event ("transaction.updated") verification — pure functions, no
 * I/O, so they're directly unit-testable (see
 * src/lib/payments/__tests__/wompiWebhook.test.ts).
 *
 * Verification algorithm per docs.wompi.co "Events" (confirmed Aug 2026):
 *   1. Read `signature.properties` (a list of dot-paths — NOT fixed, must
 *      be read from each event, never hardcoded).
 *   2. Resolve each path against the event body, in order, and concatenate
 *      the values with no separator.
 *   3. Append the event's top-level `timestamp`.
 *   4. Append the events secret.
 *   5. SHA256 the result; compare (case-insensitively) against
 *      `signature.checksum` (also sent as the `X-Event-Checksum` header).
 */

const wompiEventSchema = z.object({
  event: z.string(),
  data: z.record(z.string(), z.unknown()),
  environment: z.string().optional(),
  signature: z.object({
    properties: z.array(z.string()).min(1),
    checksum: z.string().min(1),
  }),
  timestamp: z.number(),
  sent_at: z.string().optional(),
});

export type WompiEvent = z.infer<typeof wompiEventSchema>;

export function parseWompiEvent(body: unknown): WompiEvent | null {
  const result = wompiEventSchema.safeParse(body);
  return result.success ? result.data : null;
}

function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

export function computeWompiChecksum(event: WompiEvent, secret: string): string {
  // signature.properties paths (e.g. "transaction.id") are documented
  // relative to `data`, NOT the event root — Wompi's own example event has
  // data.transaction.id but a property path of just "transaction.id".
  const concatenatedValues = event.signature.properties
    .map((path) => {
      const value = getByPath(event.data, path);
      return value === undefined || value === null ? "" : String(value);
    })
    .join("");

  const base = concatenatedValues + String(event.timestamp) + secret;
  return createHash("sha256").update(base).digest("hex");
}

export function verifyWompiChecksum(event: WompiEvent, secret: string): boolean {
  const expected = computeWompiChecksum(event, secret);
  return expected.toLowerCase() === event.signature.checksum.toLowerCase();
}

/**
 * Wompi's `environment` is "test" for Sandbox keys — confirmed by the
 * existing test coverage below, unchanged. For Live/production it is
 * **"prod"**, not "production": the original assumption here (this
 * comment previously said "production", "confirmed Aug 2026" per this
 * file's own header) was contradicted by a real production webhook
 * delivery (XAYVEN CORE Phase 5 — Wompi payment state investigation,
 * 2026-08-21): a genuinely APPROVED transaction, with a correctly
 * verified checksum (proving WOMPI_EVENTS_SECRET was right), was rejected
 * here with `{"got":"prod"}` — every real production webhook was
 * unconditionally rejected regardless of how WOMPI_ENV was configured,
 * because "prod" could never equal either literal this function accepted
 * before. This rejects a sandbox event being replayed against a
 * production deployment (or vice versa). Skipped (returns true) if the
 * event doesn't carry the field, since its presence isn't guaranteed by
 * every account configuration — the checksum (tied to the
 * environment-specific events secret) remains the primary guard either
 * way.
 */
export function verifyWompiEnvironment(event: WompiEvent, configuredEnv: string): boolean {
  if (!event.environment) return true;
  const expected = configuredEnv === "production" ? "prod" : "test";
  return event.environment === expected;
}

export interface WompiEventTransaction {
  id: string;
  status: string;
  reference: string;
  amountInCents: number;
  currency: string;
}

/**
 * Reads `data.transaction` defensively (accepts both `amount_in_cents` and
 * `amountInCents`, since Wompi's own docs examples are inconsistent about
 * casing) rather than assuming one exact shape.
 */
export function extractWompiTransaction(event: WompiEvent): WompiEventTransaction | null {
  const tx = event.data.transaction as Record<string, unknown> | undefined;
  if (!tx || typeof tx !== "object") return null;

  const id = tx.id;
  const status = tx.status;
  const reference = tx.reference;
  const amountInCents = tx.amount_in_cents ?? tx.amountInCents;
  const currency = tx.currency;

  if (
    typeof id !== "string" ||
    typeof status !== "string" ||
    typeof reference !== "string" ||
    typeof amountInCents !== "number" ||
    typeof currency !== "string"
  ) {
    return null;
  }

  return { id, status, reference, amountInCents, currency };
}

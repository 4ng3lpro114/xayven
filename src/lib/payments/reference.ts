import { randomBytes } from "node:crypto";

/**
 * `XAYVEN-{projectId}-{uniqueId}` — the projectId segment lets a human (or
 * a support search) trace a reference straight back to its project without
 * a DB lookup; the random segment guarantees two attempts never collide,
 * even for the same project/paymentType retried seconds apart.
 */
export function generatePaymentReference(projectId: string): string {
  const shortProjectId = projectId.replace(/-/g, "").slice(0, 8);
  const unique = randomBytes(6).toString("hex");
  return `XAYVEN-${shortProjectId}-${unique}`.toUpperCase();
}

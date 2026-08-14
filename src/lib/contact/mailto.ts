/**
 * Builds a `mailto:` link for the admin to reply to a contact request —
 * opens the admin's own email client, nothing more. Deliberately NOT a
 * messaging system: XAYVEN never sends this email itself, never stores
 * the reply, and never infers that a reply was actually sent just because
 * this link was clicked (see ContactRequestStatusActions — status changes
 * stay a separate, explicit action).
 *
 * Pure and independently testable. `email` is URI-encoded defensively
 * (mailto addresses don't strictly need it, but a stray `?`/`&`/`#` in a
 * malformed address must never corrupt the `subject` query param that
 * follows it), and `subject` is always encoded.
 */
export function buildContactRequestMailto(email: string): string {
  const subject = encodeURIComponent("Solicitud de proyecto XAYVEN");
  return `mailto:${encodeURIComponent(email)}?subject=${subject}`;
}

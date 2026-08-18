import "server-only";

/**
 * International Pricing Phase E — anti-hallucination CAPA 2: a post-hoc,
 * detection-only check on the model's FINAL reply. CAPA 1 (the system
 * prompt rule forcing a fresh get_official_price call for any price, see
 * knowledge.ts) is the real defense — this is the second line, for when
 * CAPA 1 is ignored despite the instruction.
 *
 * Explicitly NOT a blocker: this never edits, rewrites, or withholds the
 * reply. It only flags a signal for logging/auditing. A false positive
 * here costs a log line, never a broken conversation — by design, per the
 * explicit instruction that this must not become an aggressive gate.
 */
export interface NumericGuardResult {
  flagged: boolean;
  /** The exact substrings that looked like a price and didn't match any
   *  authorized amount from this turn's tool call(s) — kept for the log
   *  line, never shown to the visitor. */
  suspiciousMatches: string[];
}

/**
 * Matches price-shaped substrings: a currency symbol/code followed by
 * digits (e.g. "$399", "USD 49", "COP 196.000"), or a bare
 * thousands-grouped number of 4+ digits (e.g. "799.000", "1,596,000") —
 * the shape XAYVEN's own formatMoney() produces for COP, and the shape a
 * hallucinated "made up" price is most likely to take. Deliberately does
 * NOT match small bare numbers (a plan's Nth feature bullet, a year, a
 * phone digit) — those are common false-negative territory this
 * heuristic accepts in exchange for not flagging every number in a reply.
 */
const PRICE_LIKE_RE = /(?:\$|USD|COP|EUR|GBP)\s?\d[\d.,]*|\b\d{1,3}(?:[.,]\d{3}){1,}\b/gi;

function normalizeDigits(text: string): string {
  return text.replace(/\D/g, "");
}

/** Every price-shaped digit group found in a piece of text, normalized —
 *  reuses PRICE_LIKE_RE as-is (never a second pattern) so "what looks like
 *  a price" means exactly the same thing whether it's the model's reply
 *  or the visitor's own message. */
function extractNormalizedDigitGroups(text: string): string[] {
  const matches = text.match(PRICE_LIKE_RE) ?? [];
  return matches.map(normalizeDigits).filter((d) => d.length > 0);
}

/**
 * Two normalized digit strings "roughly match" only when identical, or
 * when one is the other with a trailing "00" (cents) appended — the one
 * realistic formatting drift observed (a model writing "$399.00" for an
 * integer amount of 399). Deliberately NOT a generic substring/contains
 * check: "10000" (from a hallucinated $10.000) must never match "100000"
 * (an authorized/user-stated 100.000) just because one digit string
 * happens to be a prefix of the other — a real correctness bug caught by
 * this micro-fix's own test suite, not just a style preference.
 */
function digitsRoughlyMatch(a: string, b: string): boolean {
  if (a === b) return true;
  return a === `${b}00` || b === `${a}00`;
}

/**
 * `authorizedAmounts` should be every officialAmount/displayAmount this
 * turn's tool call(s) actually returned (never amounts from a previous
 * turn — CAPA 1's whole point is that a previous turn's number is not a
 * valid source). A detected price-like substring is "suspicious" only if
 * its digits don't roughly match any authorized amount (see
 * digitsRoughlyMatch()).
 *
 * `userMessage` (the visitor's own latest message, this same turn) is an
 * additional, separate exclusion: a price-shaped number the model is only
 * echoing back from what the VISITOR just said (a stated budget, a
 * quantity, a contextual figure) is not XAYVEN asserting a new price —
 * flagging it would be a false positive of exactly the kind observed in
 * R4 live verification ("Entiendo que tu presupuesto es de 100.000
 * pesos..."). Never removes a number that's ALSO absent from the
 * visitor's message, so a genuinely fabricated price still flags even if
 * the visitor happened to mention some other, unrelated number this turn.
 */
export function checkNumericGuard(
  reply: string,
  authorizedAmounts: readonly number[],
  userMessage?: string
): NumericGuardResult {
  const matches = reply.match(PRICE_LIKE_RE) ?? [];
  if (matches.length === 0) return { flagged: false, suspiciousMatches: [] };

  const authorizedDigits = authorizedAmounts.map((n) => String(Math.round(n))).filter((d) => d.length > 0);
  const userDigitGroups = userMessage ? extractNormalizedDigitGroups(userMessage) : [];

  const suspicious = matches.filter((match) => {
    const digits = normalizeDigits(match);
    if (!digits) return false;
    if (authorizedDigits.some((a) => digitsRoughlyMatch(digits, a))) return false;
    if (userDigitGroups.some((u) => digitsRoughlyMatch(digits, u))) return false;
    return true;
  });

  return { flagged: suspicious.length > 0, suspiciousMatches: suspicious };
}

import type { ServiceFaqItem } from "@/lib/services/types";

/**
 * Admin Phase 5 — plain-text <-> structured-array conversion helpers for
 * ServiceForm.tsx / PackageForm.tsx. Deliberate design choice: rather
 * than building a full dynamic array-of-inputs widget for every list
 * field (problem[], includes[], forWhom.idealIf[], useCases[], faq[] —
 * 5 list fields × 2 locales, plus Maintenance features), each renders as
 * one plain <textarea>, one item per line (FAQ uses a "Q: ... / A: ..."
 * block format). Pragmatic, keeps Admin from becoming the "CMS gigante"
 * the master prompt explicitly warns against, while still being
 * genuinely editable — never a fake/read-only field.
 */

/** One array item per line. Empty lines are dropped, not preserved as
 *  empty entries. */
export function toLines(items: readonly string[]): string {
  return items.join("\n");
}

export function fromLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** "Q: ...\nA: ...\n\nQ: ...\nA: ..." — one blank-line-separated block per
 *  FAQ item. */
export function toFaqText(items: readonly ServiceFaqItem[]): string {
  return items.map((item) => `Q: ${item.question}\nA: ${item.answer}`).join("\n\n");
}

/**
 * Pre-Production Correction R2 — a block missing either a Q: or A: line
 * used to be silently dropped by fromFaqText() below, with no signal
 * back to the admin that anything was lost. `parseFaqText()` is the
 * validating counterpart: it returns the same successfully-parsed items
 * AND the raw text of every block that failed to parse, so a caller
 * (ServiceForm.tsx) can block the save and show exactly what's wrong
 * instead of silently discarding it. `fromFaqText()` stays as the
 * lenient, items-only view (now implemented in terms of this function)
 * for any consumer that only needs the valid items — same public API,
 * same lenient behavior, no breaking change.
 */
export interface FaqParseResult {
  items: ServiceFaqItem[];
  /** Raw block text for each block that didn't parse — empty when every
   *  block in the input was well-formed. */
  invalidBlocks: string[];
}

export function parseFaqText(text: string): FaqParseResult {
  const items: ServiceFaqItem[] = [];
  const invalidBlocks: string[] = [];

  const blocks = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  for (const block of blocks) {
    const lines = block.split("\n");
    const qLine = lines.find((l) => l.trim().startsWith("Q:"));
    const aLine = lines.find((l) => l.trim().startsWith("A:"));
    const question = qLine ? qLine.replace(/^Q:\s*/, "").trim() : "";
    const answer = aLine ? aLine.replace(/^A:\s*/, "").trim() : "";

    if (question && answer) {
      items.push({ question, answer });
    } else {
      invalidBlocks.push(block);
    }
  }

  return { items, invalidBlocks };
}

export function fromFaqText(text: string): ServiceFaqItem[] {
  return parseFaqText(text).items;
}

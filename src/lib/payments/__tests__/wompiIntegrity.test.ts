import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { generateWompiIntegritySignature, toAmountInCents } from "@/lib/payments/providers/wompi";

// Fictitious Sandbox-shaped values — never real credentials.
const FAKE_SECRET = "test_integrity_FAKESECRETFORTESTSONLY0000";

describe("generateWompiIntegritySignature", () => {
  it("matches SHA256(reference + amountInCents + currency + secret), in that exact order", () => {
    const params = {
      reference: "XAYVEN-TEST123-abc123",
      amountInCents: 150_000_00,
      currency: "COP",
      integritySecret: FAKE_SECRET,
    };

    const expected = createHash("sha256")
      .update(`${params.reference}${params.amountInCents}${params.currency}${params.integritySecret}`)
      .digest("hex");

    expect(generateWompiIntegritySignature(params)).toBe(expected);
  });

  it("inserts expirationTime between currency and secret when provided", () => {
    const params = {
      reference: "XAYVEN-TEST123-abc123",
      amountInCents: 150_000_00,
      currency: "COP",
      integritySecret: FAKE_SECRET,
      expirationTime: "2030-01-01T00:00:00.000Z",
    };

    const expected = createHash("sha256")
      .update(
        `${params.reference}${params.amountInCents}${params.currency}${params.expirationTime}${params.integritySecret}`
      )
      .digest("hex");

    expect(generateWompiIntegritySignature(params)).toBe(expected);
  });

  it("returns a 64-character lowercase hex digest", () => {
    const sig = generateWompiIntegritySignature({
      reference: "XAYVEN-abc",
      amountInCents: 100,
      currency: "COP",
      integritySecret: FAKE_SECRET,
    });
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is sensitive to field order — swapping reference/currency changes the hash", () => {
    const a = generateWompiIntegritySignature({
      reference: "AAA",
      amountInCents: 100,
      currency: "COP",
      integritySecret: FAKE_SECRET,
    });
    const b = generateWompiIntegritySignature({
      reference: "COP",
      amountInCents: 100,
      currency: "AAA",
      integritySecret: FAKE_SECRET,
    });
    expect(a).not.toBe(b);
  });

  it("changes when the amount changes (never marks a different amount as valid)", () => {
    const base = {
      reference: "XAYVEN-abc",
      currency: "COP",
      integritySecret: FAKE_SECRET,
    };
    const sigLow = generateWompiIntegritySignature({ ...base, amountInCents: 100_000 });
    const sigHigh = generateWompiIntegritySignature({ ...base, amountInCents: 999_999 });
    expect(sigLow).not.toBe(sigHigh);
  });
});

describe("toAmountInCents", () => {
  it("converts whole-peso amounts to cents", () => {
    expect(toAmountInCents(1_500_000)).toBe(150_000_000);
  });

  it("rounds defensively for fractional input", () => {
    expect(toAmountInCents(1000.4)).toBe(100_040);
  });
});

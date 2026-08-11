import { describe, it, expect } from "vitest";
import { isPayPalCurrencySupported } from "@/lib/payments/providers/paypal";

// Regression test for a real finding during Sandbox smoke testing: a live
// PayPal order-create call with currency_code "COP" returns
// 422 CURRENCY_NOT_SUPPORTED. See docs/payments.md §4.
describe("isPayPalCurrencySupported", () => {
  it("rejects COP — confirmed unsupported by a live Sandbox API call", () => {
    expect(isPayPalCurrencySupported("COP")).toBe(false);
  });

  it("accepts USD", () => {
    expect(isPayPalCurrencySupported("USD")).toBe(true);
  });

  it("is case-sensitive to the exact currency codes PayPal documents", () => {
    expect(isPayPalCurrencySupported("usd")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  parseWompiEvent,
  computeWompiChecksum,
  verifyWompiChecksum,
  verifyWompiEnvironment,
  extractWompiTransaction,
  type WompiEvent,
} from "@/lib/payments/providers/wompiWebhook";

const SECRET = "test_events_FAKESECRETFORTESTSONLY0000";

const SIGNED_PROPERTIES = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];

/** Builds a self-consistent event: whatever `data`/`environment`/`timestamp`
 *  end up set, `signature.checksum` is (re)computed to match — exactly what
 *  a real Wompi delivery looks like. Pass an explicit `checksum` override to
 *  deliberately build an INCONSISTENT (tampered) event instead. */
function buildEvent(overrides: {
  data?: WompiEvent["data"];
  environment?: string;
  timestamp?: number;
  checksum?: string;
} = {}): WompiEvent {
  const event: WompiEvent = {
    event: "transaction.updated",
    data: overrides.data ?? {
      transaction: {
        id: "txn-123",
        status: "APPROVED",
        reference: "XAYVEN-abc-123",
        amount_in_cents: 150_000_00,
        currency: "COP",
      },
    },
    environment: overrides.environment ?? "test",
    signature: { properties: SIGNED_PROPERTIES, checksum: "" },
    timestamp: overrides.timestamp ?? 1_700_000_000_000,
  };

  event.signature.checksum = overrides.checksum ?? computeWompiChecksum(event, SECRET);
  return event;
}

describe("parseWompiEvent", () => {
  it("accepts a well-formed event", () => {
    expect(parseWompiEvent(buildEvent())).not.toBeNull();
  });

  it("rejects a payload missing signature.properties", () => {
    const bad = { event: "transaction.updated", data: {}, signature: { checksum: "x" }, timestamp: 1 };
    expect(parseWompiEvent(bad)).toBeNull();
  });

  it("rejects garbage input", () => {
    expect(parseWompiEvent("not an object")).toBeNull();
    expect(parseWompiEvent(null)).toBeNull();
    expect(parseWompiEvent(undefined)).toBeNull();
  });
});

describe("verifyWompiChecksum", () => {
  it("accepts a correctly computed checksum", () => {
    const event = buildEvent();
    expect(verifyWompiChecksum(event, SECRET)).toBe(true);
  });

  it("rejects when the secret is wrong", () => {
    const event = buildEvent();
    expect(verifyWompiChecksum(event, "wrong_secret")).toBe(false);
  });

  it("rejects when any signed property value was tampered with", () => {
    const event = buildEvent();
    // Change status AFTER computing the checksum against the original value
    // — simulates an attacker modifying the payload in transit.
    const tampered: WompiEvent = {
      ...event,
      data: {
        transaction: { ...(event.data.transaction as object), status: "DECLINED" },
      },
    };
    expect(verifyWompiChecksum(tampered, SECRET)).toBe(false);
  });

  it("rejects when the checksum itself was tampered with", () => {
    const event = buildEvent();
    const tampered: WompiEvent = {
      ...event,
      signature: { ...event.signature, checksum: "0".repeat(64) },
    };
    expect(verifyWompiChecksum(tampered, SECRET)).toBe(false);
  });

  it("only uses the properties listed in signature.properties, dynamically", () => {
    // Two events with different irrelevant fields but the same signed
    // properties must produce the same checksum — proves we don't
    // hardcode a fixed field list.
    const eventA = buildEvent();
    const eventB = buildEvent({
      data: {
        transaction: {
          id: "txn-123",
          status: "APPROVED",
          reference: "XAYVEN-abc-123",
          amount_in_cents: 150_000_00,
          currency: "COP",
          payment_method_type: "CARD", // extra, unsigned field
        },
      },
    });
    expect(computeWompiChecksum(eventA, SECRET)).toBe(computeWompiChecksum(eventB, SECRET));
  });

  it("matches an independently computed SHA256 of properties+timestamp+secret", () => {
    const event = buildEvent();
    const expected = createHash("sha256")
      .update(`txn-123APPROVED${150_000_00}${event.timestamp}${SECRET}`)
      .digest("hex");
    expect(computeWompiChecksum(event, SECRET)).toBe(expected);
  });
});

describe("verifyWompiEnvironment", () => {
  it("accepts 'test' when configured for sandbox", () => {
    expect(verifyWompiEnvironment(buildEvent({ environment: "test" }), "sandbox")).toBe(true);
  });

  it("rejects 'production' when configured for sandbox", () => {
    expect(verifyWompiEnvironment(buildEvent({ environment: "production" }), "sandbox")).toBe(false);
  });

  it("passes when the event carries no environment field at all", () => {
    const event = buildEvent();
    delete (event as { environment?: string }).environment;
    expect(verifyWompiEnvironment(event, "sandbox")).toBe(true);
  });

  // XAYVEN CORE Phase 5 — a real production webhook delivery sent
  // environment: "prod", not "production" (see the doc comment on
  // verifyWompiEnvironment itself). These 3 cases were entirely
  // uncovered before this — nobody had verified the production branch
  // against a real delivery until it broke in production.
  it("accepts 'prod' when configured for production", () => {
    expect(verifyWompiEnvironment(buildEvent({ environment: "prod" }), "production")).toBe(true);
  });

  it("rejects 'production' (the old, disproven assumption) when configured for production", () => {
    expect(verifyWompiEnvironment(buildEvent({ environment: "production" }), "production")).toBe(
      false
    );
  });

  it("rejects 'test' when configured for production", () => {
    expect(verifyWompiEnvironment(buildEvent({ environment: "test" }), "production")).toBe(false);
  });
});

describe("extractWompiTransaction", () => {
  it("reads snake_case amount_in_cents", () => {
    const tx = extractWompiTransaction(buildEvent());
    expect(tx).toEqual({
      id: "txn-123",
      status: "APPROVED",
      reference: "XAYVEN-abc-123",
      amountInCents: 150_000_00,
      currency: "COP",
    });
  });

  it("also accepts camelCase amountInCents", () => {
    const event = buildEvent({
      data: {
        transaction: {
          id: "txn-1",
          status: "PENDING",
          reference: "XAYVEN-x",
          amountInCents: 5000,
          currency: "COP",
        },
      },
    });
    expect(extractWompiTransaction(event)?.amountInCents).toBe(5000);
  });

  it("returns null when the transaction shape is incomplete", () => {
    const event = buildEvent({ data: { transaction: { id: "only-id" } } });
    expect(extractWompiTransaction(event)).toBeNull();
  });
});

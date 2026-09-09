import { describe, it, expect } from "vitest";
import { fingerprintRequest, normalizeIdempotencyKey } from "@/lib/orchestration/idempotency";
import { sanitize } from "@/lib/audit/sanitize";

describe("idempotency", () => {
  it("produces a stable fingerprint regardless of key order", () => {
    const a = fingerprintRequest({ amount: 100, currency: "QAR" });
    const b = fingerprintRequest({ currency: "QAR", amount: 100 });
    expect(a).toBe(b);
  });

  it("different bodies fingerprint differently", () => {
    expect(fingerprintRequest({ amount: 100, currency: "QAR" })).not.toBe(
      fingerprintRequest({ amount: 200, currency: "QAR" }),
    );
  });

  it("normalizes empty keys to undefined", () => {
    expect(normalizeIdempotencyKey("")).toBeUndefined();
    expect(normalizeIdempotencyKey("  ")).toBeUndefined();
    expect(normalizeIdempotencyKey(null)).toBeUndefined();
    expect(normalizeIdempotencyKey("order-1")).toBe("order-1");
  });

  it("rejects overlong keys", () => {
    expect(() => normalizeIdempotencyKey("x".repeat(256))).toThrow();
  });
});

describe("PCI sanitization", () => {
  it("redacts sensitive fields recursively", () => {
    const clean = sanitize({
      amount: 100,
      // The whole `card` object is a sensitive key → fully redacted.
      card: { number: "4242424242424242", cvc: "123" },
      token: "secret",
      nested: { password: "p", ok: "keep" },
    });
    expect(clean).toEqual({
      amount: 100,
      card: "[REDACTED]",
      token: "[REDACTED]",
      nested: { password: "[REDACTED]", ok: "keep" },
    });
  });

  it("redacts nested card fields even when the parent key differs", () => {
    const clean = sanitize({ payment: { number: "4242", cvv: "999", brand: "visa" } }) as {
      payment: Record<string, string>;
    };
    expect(clean.payment.number).toBe("[REDACTED]");
    expect(clean.payment.cvv).toBe("[REDACTED]");
    expect(clean.payment.brand).toBe("visa");
  });
});

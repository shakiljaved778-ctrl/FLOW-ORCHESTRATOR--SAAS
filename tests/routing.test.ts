import { describe, it, expect } from "vitest";
import { route } from "@/lib/orchestration/router";

describe("payment routing", () => {
  it("routes QAR to Fawri+ first when all providers available", () => {
    const d = route({ currency: "QAR", amount: 15000, available: ["stripe", "checkout", "fawri"] });
    expect(d.candidates[0]).toBe("fawri");
    expect(d.candidates).toEqual(["fawri", "checkout", "stripe"]);
  });

  it("routes USD to Stripe first", () => {
    const d = route({ currency: "USD", amount: 5000, available: ["stripe", "checkout", "fawri"] });
    expect(d.candidates[0]).toBe("stripe");
  });

  it("falls back to enabled providers only", () => {
    // Only Stripe enabled (MVP week 1): QAR still routes, via Stripe.
    const d = route({ currency: "QAR", amount: 15000, available: ["stripe"] });
    expect(d.candidates).toEqual(["stripe"]);
  });

  it("respects per-provider amount caps (Fawri+)", () => {
    // Above Fawri+ cap → Fawri+ dropped from candidates.
    const d = route({ currency: "QAR", amount: 20_000_000, available: ["checkout", "fawri"] });
    expect(d.candidates).not.toContain("fawri");
    expect(d.candidates[0]).toBe("checkout");
  });

  it("throws when no provider can serve the request", () => {
    expect(() => route({ currency: "AED", amount: 100, available: ["fawri"] })).toThrow(
      /No available provider/,
    );
  });

  it("throws on a non-positive amount", () => {
    expect(() => route({ currency: "USD", amount: 0, available: ["stripe"] })).toThrow();
  });
});

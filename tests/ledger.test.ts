import { describe, it, expect } from "vitest";
import { isBalanced, assertBalanced, buildPaymentEntry } from "@/lib/ledger/ledger.service";
import { toMinorUnits, fromMinorUnits, formatMoney } from "@/lib/utils/money";

describe("ledger balancing", () => {
  it("accepts a balanced two-line entry", () => {
    expect(
      isBalanced([
        { accountId: "ar", debit: 15000, credit: 0, currency: "QAR" },
        { accountId: "rev", debit: 0, credit: 15000, currency: "QAR" },
      ]),
    ).toBe(true);
  });

  it("rejects an unbalanced entry", () => {
    expect(
      isBalanced([
        { accountId: "ar", debit: 15000, credit: 0, currency: "QAR" },
        { accountId: "rev", debit: 0, credit: 14000, currency: "QAR" },
      ]),
    ).toBe(false);
  });

  it("rejects a two-sided line", () => {
    expect(
      isBalanced([
        { accountId: "ar", debit: 100, credit: 100, currency: "QAR" },
        { accountId: "rev", debit: 0, credit: 0, currency: "QAR" },
      ]),
    ).toBe(false);
  });

  it("rejects a single-line entry", () => {
    expect(isBalanced([{ accountId: "ar", debit: 100, credit: 0, currency: "QAR" }])).toBe(false);
  });

  it("buildPaymentEntry produces a balanced AR/Revenue entry", () => {
    const entry = buildPaymentEntry({
      orgId: "org",
      amount: 15000,
      currency: "QAR",
      accountsReceivableId: "ar",
      revenueId: "rev",
    });
    expect(entry.lines).toHaveLength(2);
    expect(() => assertBalanced(entry.lines)).not.toThrow();
    const debit = entry.lines.reduce((s, l) => s + l.debit, 0);
    const credit = entry.lines.reduce((s, l) => s + l.credit, 0);
    expect(debit).toBe(credit);
    expect(debit).toBe(15000);
  });
});

describe("money minor units", () => {
  it("converts major → minor without float drift", () => {
    expect(toMinorUnits("10.50", "QAR")).toBe(1050);
    expect(toMinorUnits(0.1 + 0.2, "USD")).toBe(30); // 0.30000000000000004 → 30
  });

  it("round-trips minor → major", () => {
    expect(fromMinorUnits(1050, "QAR")).toBe("10.50");
    expect(formatMoney(1050, "qar")).toBe("QAR 10.50");
  });

  it("throws on unsupported currency", () => {
    expect(() => toMinorUnits("1.00", "EUR")).toThrow();
  });
});

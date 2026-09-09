import { describe, it, expect } from "vitest";
import { parseSettlementCsv, matchSettlements, type PaymentRef } from "@/lib/ledger/settlement";
import type { SettlementRecord } from "@/lib/ledger/reconciliation";

describe("settlement CSV parsing", () => {
  it("parses a well-formed file", () => {
    const csv = [
      "provider,provider_ref,amount,currency",
      "stripe,pi_1,15000,QAR",
      "checkout,pay_2,5000,AED",
    ].join("\n");
    const { records, errors } = parseSettlementCsv(csv);
    expect(errors).toHaveLength(0);
    expect(records).toEqual([
      { provider: "stripe", providerRef: "pi_1", amount: 15000, currency: "QAR" },
      { provider: "checkout", providerRef: "pay_2", amount: 5000, currency: "AED" },
    ]);
  });

  it("tolerates reordered columns and case", () => {
    const csv = ["Amount,Currency,Provider,Provider_Ref", "100,qar,FAWRI,trf_9"].join("\n");
    const { records } = parseSettlementCsv(csv);
    expect(records[0]).toEqual({ provider: "fawri", providerRef: "trf_9", amount: 100, currency: "QAR" });
  });

  it("reports missing required columns", () => {
    const { records, errors } = parseSettlementCsv("provider,amount\nstripe,100");
    expect(records).toHaveLength(0);
    expect(errors[0]).toMatch(/Missing required columns/);
  });

  it("collects per-row errors and keeps valid rows", () => {
    const csv = [
      "provider,provider_ref,amount,currency",
      "stripe,pi_1,15000,QAR",
      "paypal,x,100,QAR", // invalid provider
      "stripe,,100,QAR", // missing ref
      "stripe,pi_2,-5,QAR", // bad amount
    ].join("\n");
    const { records, errors } = parseSettlementCsv(csv);
    expect(records).toHaveLength(1);
    expect(errors).toHaveLength(3);
  });
});

describe("settlement matching", () => {
  const payments: PaymentRef[] = [
    { paymentId: "p1", provider: "stripe", providerRef: "pi_1", amount: 15000, currency: "QAR" },
    { paymentId: "p2", provider: "checkout", providerRef: "pay_2", amount: 5000, currency: "AED" },
    { paymentId: "p3", provider: "fawri", providerRef: null, amount: 100, currency: "QAR" },
  ];

  it("matches by provider + ref with equal amount/currency", () => {
    const settlements: SettlementRecord[] = [
      { provider: "stripe", providerRef: "pi_1", amount: 15000, currency: "QAR" },
    ];
    const r = matchSettlements(payments, settlements);
    expect(r.matched.map((m) => m.paymentId)).toEqual(["p1"]);
    expect(r.unmatchedPayments).toContain("p3"); // null ref
    expect(r.unmatchedPayments).toContain("p2");
  });

  it("flags an amount mismatch as a discrepancy, not a match", () => {
    const settlements: SettlementRecord[] = [
      { provider: "stripe", providerRef: "pi_1", amount: 14000, currency: "QAR" },
    ];
    const r = matchSettlements(payments, settlements);
    expect(r.matched).toHaveLength(0);
    expect(r.discrepancies.map((d) => d.paymentId)).toEqual(["p1"]);
  });

  it("reports settlements with no corresponding payment", () => {
    const settlements: SettlementRecord[] = [
      { provider: "stripe", providerRef: "pi_unknown", amount: 100, currency: "QAR" },
    ];
    const r = matchSettlements(payments, settlements);
    expect(r.unmatchedSettlements).toEqual(settlements);
  });
});

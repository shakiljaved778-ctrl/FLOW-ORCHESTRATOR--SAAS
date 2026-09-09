import { describe, it, expect } from "vitest";
import { parseSettlementReport, isSettlementFormat } from "@/lib/ledger/settlement-formats";

describe("settlement format detection", () => {
  it("recognizes known formats", () => {
    expect(isSettlementFormat("stripe")).toBe(true);
    expect(isSettlementFormat("checkout")).toBe(true);
    expect(isSettlementFormat("fawri")).toBe(true);
    expect(isSettlementFormat("canonical")).toBe(true);
    expect(isSettlementFormat("paypal")).toBe(false);
  });
});

describe("stripe report adapter", () => {
  it("maps payment_intent_id + gross (major units) to canonical minor units", () => {
    const csv = [
      "reporting_category,payment_intent_id,charge_id,gross,currency",
      "charge,pi_123,ch_1,150.00,qar",
      "charge,pi_456,ch_2,50.25,aed",
    ].join("\n");
    const { records, errors } = parseSettlementReport(csv, "stripe");
    expect(errors).toHaveLength(0);
    expect(records).toEqual([
      { provider: "stripe", providerRef: "pi_123", amount: 15000, currency: "QAR" },
      { provider: "stripe", providerRef: "pi_456", amount: 5025, currency: "AED" },
    ]);
  });

  it("skips non-charge reporting categories (fees, payouts)", () => {
    const csv = [
      "reporting_category,payment_intent_id,gross,currency",
      "charge,pi_1,100.00,QAR",
      "fee,,2.50,QAR",
      "payout,,-100.00,QAR",
    ].join("\n");
    const { records } = parseSettlementReport(csv, "stripe");
    expect(records).toHaveLength(1);
    expect(records[0].providerRef).toBe("pi_1");
  });

  it("falls back to charge_id when payment_intent_id is blank", () => {
    const csv = ["payment_intent_id,charge_id,gross,currency", ",ch_only,10.00,USD"].join("\n");
    const { records } = parseSettlementReport(csv, "stripe");
    expect(records[0].providerRef).toBe("ch_only");
  });
});

describe("checkout.com report adapter", () => {
  it("maps Payment ID + Amount (major units)", () => {
    const csv = ["Payment ID,Amount,Currency", "pay_abc,75.00,AED"].join("\n");
    const { records, errors } = parseSettlementReport(csv, "checkout");
    expect(errors).toHaveLength(0);
    expect(records[0]).toEqual({ provider: "checkout", providerRef: "pay_abc", amount: 7500, currency: "AED" });
  });

  it("reports a missing reference column", () => {
    const csv = ["Amount,Currency", "10.00,AED"].join("\n");
    const { records, errors } = parseSettlementReport(csv, "checkout");
    expect(records).toHaveLength(0);
    expect(errors[0]).toMatch(/reference columns/);
  });
});

describe("fawri+ report adapter", () => {
  it("maps transfer_id + amount already in minor units", () => {
    const csv = ["transfer_id,amount,currency,status", "trf_1,15000,QAR,COMPLETED"].join("\n");
    const { records, errors } = parseSettlementReport(csv, "fawri");
    expect(errors).toHaveLength(0);
    expect(records[0]).toEqual({ provider: "fawri", providerRef: "trf_1", amount: 15000, currency: "QAR" });
  });
});

describe("canonical passthrough", () => {
  it("delegates to the canonical parser", () => {
    const csv = ["provider,provider_ref,amount,currency", "stripe,pi_9,15000,QAR"].join("\n");
    const { records } = parseSettlementReport(csv, "canonical");
    expect(records[0]).toEqual({ provider: "stripe", providerRef: "pi_9", amount: 15000, currency: "QAR" });
  });
});

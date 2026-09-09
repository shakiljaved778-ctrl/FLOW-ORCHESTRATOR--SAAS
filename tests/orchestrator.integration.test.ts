import { describe, it, expect, beforeEach } from "vitest";
import { FakeSupabase } from "./helpers/fake-supabase";
import { orchestratePayment } from "@/lib/orchestration/orchestrator";
import type { PaymentProvider } from "@/lib/providers/provider.interface";
import type { ChargeResult, PSP } from "@/lib/orchestration/types";

/** A fake provider whose charge() returns a preset result. */
function fakeProvider(id: PSP, result: Partial<ChargeResult>): PaymentProvider {
  return {
    id,
    async charge() {
      return { provider: id, success: false, status: "failed", ...result } as ChargeResult;
    },
    async refund() {
      return { provider: id, success: true, status: "refunded" };
    },
    async verifyWebhook() {
      return {};
    },
  };
}

const ORG = "org_1";

let db: FakeSupabase;

beforeEach(() => {
  db = new FakeSupabase();
  db.seed("organizations", [{ id: ORG, clerk_org_id: "clerk_1", name: "Demo" }]);
  db.seed("accounts", [
    { id: "acc_ar", org_id: ORG, code: "1100", currency: "QAR" },
    { id: "acc_rev", org_id: ORG, code: "4000", currency: "QAR" },
  ]);
});

function resolver(map: Record<string, PaymentProvider>) {
  return (id: PSP) => {
    const p = map[id];
    if (!p) throw new Error(`no fake provider for ${id}`);
    return p;
  };
}

describe("orchestratePayment (end-to-end wiring)", () => {
  it("captures a payment, posts a balanced ledger entry, and records usage + audit", async () => {
    const providers = {
      stripe: fakeProvider("stripe", { success: true, status: "succeeded", providerRef: "pi_1" }),
    };

    const res = await orchestratePayment(
      db.asClient(),
      { orgId: ORG, amount: 15000, currency: "QAR", reference: "order-1" },
      { availableProviders: ["stripe"], resolveProvider: resolver(providers) },
    );

    expect(res.status).toBe("succeeded");
    expect(res.provider).toBe("stripe");
    expect(res.idempotentReplay).toBe(false);

    // Payment persisted as succeeded.
    const payment = db.tables.payments[0];
    expect(payment.status).toBe("succeeded");
    expect(payment.routed_provider).toBe("stripe");

    // Exactly one attempt recorded.
    expect(db.tables.payment_attempts).toHaveLength(1);

    // A balanced journal entry with two legs was posted via the RPC.
    expect(db.tables.journal_entries).toHaveLength(1);
    const legs = db.tables.line_items;
    expect(legs).toHaveLength(2);
    const debit = legs.reduce((s, l) => s + Number(l.debit ?? 0), 0);
    const credit = legs.reduce((s, l) => s + Number(l.credit ?? 0), 0);
    expect(debit).toBe(credit);
    expect(debit).toBe(15000);

    // Usage recorded and audit trail written.
    expect(db.tables.usage_records).toHaveLength(1);
    const actions = db.tables.audit_logs.map((a) => a.action);
    expect(actions).toContain("payment.created");
    expect(actions).toContain("ledger.entry");
  });

  it("fails over from a declining primary to a succeeding backup", async () => {
    const providers = {
      fawri: fakeProvider("fawri", { success: false, status: "failed", errorCode: "declined" }),
      stripe: fakeProvider("stripe", { success: true, status: "succeeded", providerRef: "pi_2" }),
    };

    const res = await orchestratePayment(
      db.asClient(),
      { orgId: ORG, amount: 15000, currency: "QAR" },
      { availableProviders: ["fawri", "stripe"], resolveProvider: resolver(providers) },
    );

    expect(res.status).toBe("succeeded");
    expect(res.provider).toBe("stripe");
    // Both attempts persisted (the failed primary + the succeeding backup).
    expect(db.tables.payment_attempts).toHaveLength(2);
    expect(db.tables.journal_entries).toHaveLength(1);
  });

  it("marks the payment failed and posts no ledger entry when all providers decline", async () => {
    const providers = {
      fawri: fakeProvider("fawri", { errorCode: "declined" }),
      stripe: fakeProvider("stripe", { errorCode: "insufficient_funds" }),
    };

    const res = await orchestratePayment(
      db.asClient(),
      { orgId: ORG, amount: 15000, currency: "QAR" },
      { availableProviders: ["fawri", "stripe"], resolveProvider: resolver(providers) },
    );

    expect(res.status).toBe("failed");
    expect(db.tables.payments[0].status).toBe("failed");
    expect(db.tables.journal_entries).toHaveLength(0);
    expect(db.tables.usage_records).toHaveLength(0);
    expect(db.tables.audit_logs.map((a) => a.action)).toContain("payment.failed");
  });

  it("returns the original payment on an idempotent replay without charging again", async () => {
    const providers = {
      stripe: fakeProvider("stripe", { success: true, status: "succeeded", providerRef: "pi_3" }),
    };
    const ctx = { availableProviders: ["stripe"] as PSP[], resolveProvider: resolver(providers) };
    const req = { orgId: ORG, amount: 15000, currency: "QAR" as const, idempotencyKey: "key-1" };

    const first = await orchestratePayment(db.asClient(), req, ctx);
    const second = await orchestratePayment(db.asClient(), req, ctx);

    expect(second.idempotentReplay).toBe(true);
    expect(second.paymentId).toBe(first.paymentId);
    // No duplicate payment or ledger entry.
    expect(db.tables.payments).toHaveLength(1);
    expect(db.tables.journal_entries).toHaveLength(1);
    expect(db.tables.payment_attempts).toHaveLength(1);
  });
});

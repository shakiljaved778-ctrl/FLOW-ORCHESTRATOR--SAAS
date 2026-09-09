import { describe, it, expect, beforeEach } from "vitest";
import { FakeSupabase } from "./helpers/fake-supabase";
import { processWebhook } from "@/lib/webhooks/process";

const ORG = "org_1";
let db: FakeSupabase;

beforeEach(() => {
  db = new FakeSupabase();
  db.seed("payments", [{ id: "p1", org_id: ORG, status: "succeeded" }]);
  db.seed("payment_attempts", [
    { id: "a1", payment_id: "p1", provider: "stripe", provider_ref: "pi_1", status: "succeeded" },
  ]);
});

describe("processWebhook (end-to-end wiring)", () => {
  it("stores the event, audits it, and reflects a refund onto the payment", async () => {
    const result = await processWebhook(db.asClient(), {
      provider: "stripe",
      externalId: "evt_1",
      eventType: "payment.refunded",
      providerRef: "pi_1",
      raw: { id: "evt_1", type: "charge.refunded" },
    });

    expect(result).toMatchObject({ received: true, paymentId: "p1" });
    expect(db.tables.payments[0].status).toBe("refunded");
    expect(db.tables.webhook_events).toHaveLength(1);
    expect(db.tables.webhook_events[0].processed_at).toBeTruthy();
    expect(db.tables.audit_logs.map((a) => a.action)).toContain("webhook.received");
  });

  it("deduplicates a redelivered event by (provider, external_id)", async () => {
    const event = {
      provider: "stripe" as const,
      externalId: "evt_dup",
      eventType: "payment.refunded",
      providerRef: "pi_1",
      raw: { id: "evt_dup" },
    };
    await processWebhook(db.asClient(), event);
    const second = await processWebhook(db.asClient(), event);

    expect(second).toMatchObject({ received: true, duplicate: true });
    expect(db.tables.webhook_events).toHaveLength(1); // no duplicate stored
    // Only the first delivery is audited.
    expect(db.tables.audit_logs.filter((a) => a.action === "webhook.received")).toHaveLength(1);
  });

  it("acknowledges an event whose reference matches no payment, without side effects", async () => {
    const result = await processWebhook(db.asClient(), {
      provider: "stripe",
      externalId: "evt_x",
      eventType: "payment.refunded",
      providerRef: "pi_unknown",
      raw: { id: "evt_x" },
    });
    expect(result).toEqual({ received: true });
    expect(db.tables.payments[0].status).toBe("succeeded"); // unchanged
  });

  it("stores a non-terminal event without changing payment state", async () => {
    const result = await processWebhook(db.asClient(), {
      provider: "stripe",
      externalId: "evt_info",
      eventType: "payment_intent.created",
      providerRef: "pi_1",
      raw: { id: "evt_info" },
    });
    expect(result).toEqual({ received: true });
    expect(db.tables.payments[0].status).toBe("succeeded");
  });
});

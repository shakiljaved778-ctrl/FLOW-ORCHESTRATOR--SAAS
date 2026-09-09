import { describe, it, expect } from "vitest";
import { executeWithFailover } from "@/lib/orchestration/retry";
import type { PaymentProvider } from "@/lib/providers/provider.interface";
import type { ChargeResult, PSP } from "@/lib/orchestration/types";

/** Build a fake provider that returns a fixed result. */
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

describe("failover engine", () => {
  const input = { amount: 15000, currency: "QAR" as const };

  it("stops at the first successful provider", async () => {
    const registry: Record<string, PaymentProvider> = {
      fawri: fakeProvider("fawri", { success: true, status: "succeeded", providerRef: "fw_1" }),
      stripe: fakeProvider("stripe", { success: true, status: "succeeded" }),
    };
    const res = await executeWithFailover(["fawri", "stripe"], input, (id) => registry[id]);
    expect(res.succeeded).toBe(true);
    expect(res.final.provider).toBe("fawri");
    expect(res.attempts).toHaveLength(1);
  });

  it("fails over to the backup when the primary fails", async () => {
    const registry: Record<string, PaymentProvider> = {
      fawri: fakeProvider("fawri", { success: false, status: "failed", errorCode: "declined" }),
      stripe: fakeProvider("stripe", { success: true, status: "succeeded", providerRef: "pi_1" }),
    };
    const res = await executeWithFailover(["fawri", "stripe"], input, (id) => registry[id]);
    expect(res.succeeded).toBe(true);
    expect(res.final.provider).toBe("stripe");
    expect(res.attempts).toHaveLength(2);
    expect(res.attempts[0].result.success).toBe(false);
  });

  it("returns the last failure when all providers fail", async () => {
    const registry: Record<string, PaymentProvider> = {
      fawri: fakeProvider("fawri", { errorCode: "declined" }),
      stripe: fakeProvider("stripe", { errorCode: "insufficient_funds" }),
    };
    const res = await executeWithFailover(["fawri", "stripe"], input, (id) => registry[id]);
    expect(res.succeeded).toBe(false);
    expect(res.attempts).toHaveLength(2);
    expect(res.final.errorCode).toBe("insufficient_funds");
  });
});

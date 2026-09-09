import { describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  CheckoutProvider,
  mapCheckoutStatus,
  verifyCheckoutSignature,
} from "@/lib/providers/checkout.provider";

/** Build a fake fetch returning the given status + JSON body, capturing the request. */
function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const cfg = {
  secretKey: "sk_sbox_test",
  webhookSecret: "wh_secret",
  apiBase: "https://api.sandbox.checkout.com",
  testSource: "tok_test",
};

describe("checkout.com status mapping", () => {
  it("treats Authorized/Captured as success", () => {
    expect(mapCheckoutStatus("Authorized")).toEqual({ status: "succeeded", success: true });
    expect(mapCheckoutStatus("Captured")).toEqual({ status: "succeeded", success: true });
  });
  it("treats Declined as failure", () => {
    expect(mapCheckoutStatus("Declined")).toEqual({ status: "failed", success: false });
  });
  it("treats Pending as processing (not yet success)", () => {
    expect(mapCheckoutStatus("Pending")).toEqual({ status: "processing", success: false });
  });
});

describe("checkout.com charge", () => {
  it("posts a token payment and normalizes an approved charge", async () => {
    const { impl, calls } = fakeFetch(201, { id: "pay_123", status: "Authorized" });
    const provider = new CheckoutProvider(cfg, { fetchImpl: impl });

    const res = await provider.charge({ amount: 15000, currency: "QAR", reference: "order-1" });

    expect(res.success).toBe(true);
    expect(res.status).toBe("succeeded");
    expect(res.providerRef).toBe("pay_123");

    // Verify the outbound request shape.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.sandbox.checkout.com/payments");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toMatchObject({
      amount: 15000,
      currency: "QAR",
      capture: true,
      source: { type: "token", token: "tok_test" },
    });
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer sk_sbox_test");
  });

  it("uses metadata.source token when provided", async () => {
    const { impl, calls } = fakeFetch(201, { id: "pay_9", status: "Captured" });
    const provider = new CheckoutProvider(cfg, { fetchImpl: impl });
    await provider.charge({ amount: 100, currency: "AED", metadata: { source: "tok_live_abc" } });
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.source.token).toBe("tok_live_abc");
  });

  it("returns a failover-eligible result on a declined charge (no throw)", async () => {
    const { impl } = fakeFetch(201, { id: "pay_x", status: "Declined" });
    const provider = new CheckoutProvider(cfg, { fetchImpl: impl });
    const res = await provider.charge({ amount: 100, currency: "AED" });
    expect(res.success).toBe(false);
    expect(res.status).toBe("failed");
  });

  it("returns a failure (no throw) on an API error response", async () => {
    const { impl } = fakeFetch(422, { error_type: "request_invalid" });
    const provider = new CheckoutProvider(cfg, { fetchImpl: impl });
    const res = await provider.charge({ amount: 100, currency: "AED" });
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe("request_invalid");
  });
});

describe("checkout.com webhook signature", () => {
  it("verifies a valid HMAC-SHA256 signature", () => {
    const body = JSON.stringify({ id: "evt_1", type: "payment_approved" });
    const sig = createHmac("sha256", "wh_secret").update(body).digest("hex");
    expect(verifyCheckoutSignature(body, sig, "wh_secret")).toBe(true);
  });
  it("rejects a bad signature", () => {
    expect(verifyCheckoutSignature("{}", "deadbeef", "wh_secret")).toBe(false);
  });
  it("verifyWebhook throws on an invalid signature", async () => {
    const provider = new CheckoutProvider(cfg);
    await expect(provider.verifyWebhook("{}", "bad")).rejects.toThrow(/Invalid Checkout.com/);
  });
});

import { describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import { FawriProvider, mapFawriStatus, verifyFawriSignature } from "@/lib/providers/fawri.provider";

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
  apiKey: "fawri_key",
  apiBase: "https://sandbox.fawri.example",
  webhookSecret: "fawri_wh",
};

describe("fawri+ status mapping", () => {
  it("maps COMPLETED/SETTLED to success", () => {
    expect(mapFawriStatus("COMPLETED")).toEqual({ status: "succeeded", success: true });
    expect(mapFawriStatus("settled")).toEqual({ status: "succeeded", success: true });
  });
  it("maps PENDING to processing", () => {
    expect(mapFawriStatus("PENDING")).toEqual({ status: "processing", success: false });
  });
  it("maps REJECTED to failure", () => {
    expect(mapFawriStatus("REJECTED")).toEqual({ status: "failed", success: false });
  });
});

describe("fawri+ charge", () => {
  it("initiates a QAR transfer and normalizes a completed transfer", async () => {
    const { impl, calls } = fakeFetch(200, { id: "trf_1", status: "COMPLETED" });
    const provider = new FawriProvider(cfg, { fetchImpl: impl });

    const res = await provider.charge({ amount: 15000, currency: "QAR", reference: "ref-1" });

    expect(res.success).toBe(true);
    expect(res.providerRef).toBe("trf_1");
    expect(calls[0].url).toBe("https://sandbox.fawri.example/v1/transfers");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toMatchObject({ amount: 15000, currency: "QAR", reference: "ref-1" });
  });

  it("rejects non-QAR currencies without calling the API", async () => {
    const { impl, calls } = fakeFetch(200, {});
    const provider = new FawriProvider(cfg, { fetchImpl: impl });
    const res = await provider.charge({ amount: 100, currency: "USD" });
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe("unsupported_currency");
    expect(calls).toHaveLength(0);
  });

  it("returns a failure (no throw) on an API error", async () => {
    const { impl } = fakeFetch(400, { message: "bad" });
    const provider = new FawriProvider(cfg, { fetchImpl: impl });
    const res = await provider.charge({ amount: 100, currency: "QAR" });
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe("http_400");
  });
});

describe("fawri+ webhook signature", () => {
  it("verifies a valid signature", () => {
    const body = JSON.stringify({ id: "evt", type: "transfer.completed" });
    const sig = createHmac("sha256", "fawri_wh").update(body).digest("hex");
    expect(verifyFawriSignature(body, sig, "fawri_wh")).toBe(true);
  });
  it("rejects a bad signature", () => {
    expect(verifyFawriSignature("{}", "nope", "fawri_wh")).toBe(false);
  });
});

import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentProvider } from "./provider.interface";
import type { ChargeInput, ChargeResult, PaymentStatus } from "@/lib/orchestration/types";
import { httpJson, type FetchImpl } from "./http";

/**
 * Fawri+ adapter — Qatar domestic instant transfers (Qatar Central Bank scheme,
 * reached through a licensed banking/PSP partner rather than a public API).
 *
 * There is no public Fawri+ REST specification, so this adapter targets a
 * PROVISIONAL, configurable partner contract:
 *
 *   POST   {apiBase}/v1/transfers            initiate a QAR collection
 *   GET    {apiBase}/v1/transfers/{id}       fetch status
 *   header  Authorization: Bearer {apiKey}
 *   webhook header  x-fawri-signature: HMAC-SHA256-hex(rawBody, webhookSecret)
 *
 * Adjust `mapFawriStatus` / request shape when the partner's spec is finalized.
 * Fawri+ is QAR-only.
 */

export interface FawriConfig {
  apiKey: string;
  apiBase: string;
  webhookSecret: string;
}

function configFromEnv(overrides?: Partial<FawriConfig>): FawriConfig {
  return {
    apiKey: overrides?.apiKey ?? process.env.FAWRI_API_KEY ?? "",
    apiBase: overrides?.apiBase ?? process.env.FAWRI_API_BASE ?? "https://sandbox.fawri.example",
    webhookSecret: overrides?.webhookSecret ?? process.env.FAWRI_WEBHOOK_SECRET ?? "",
  };
}

/** Map a Fawri+ partner status to our normalized PaymentStatus. */
export function mapFawriStatus(status: string): { status: PaymentStatus; success: boolean } {
  switch (status.toUpperCase()) {
    case "COMPLETED":
    case "SETTLED":
    case "SUCCESS":
      return { status: "succeeded", success: true };
    case "PENDING":
    case "PROCESSING":
      return { status: "processing", success: false };
    case "REFUNDED":
    case "REVERSED":
      return { status: "refunded", success: true };
    default: // REJECTED, FAILED, EXPIRED, ...
      return { status: "failed", success: false };
  }
}

export function verifyFawriSignature(rawBody: string, signature: string, secret: string): boolean {
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export class FawriProvider implements PaymentProvider {
  readonly id = "fawri" as const;
  private cfg: FawriConfig;
  private fetchImpl?: FetchImpl;

  constructor(cfg?: Partial<FawriConfig>, deps?: { fetchImpl?: FetchImpl }) {
    this.cfg = configFromEnv(cfg);
    this.fetchImpl = deps?.fetchImpl;
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.cfg.apiKey}` };
  }

  async charge(input: ChargeInput): Promise<ChargeResult> {
    if (!this.cfg.apiKey) return fail("config_error", "FAWRI_API_KEY is not configured");
    if (input.currency !== "QAR") {
      return fail("unsupported_currency", `Fawri+ only supports QAR, got ${input.currency}`);
    }
    try {
      const res = await httpJson<Record<string, unknown>>({
        method: "POST",
        url: `${this.cfg.apiBase}/v1/transfers`,
        headers: this.authHeaders(),
        body: {
          amount: input.amount, // minor units (halalas)
          currency: "QAR",
          reference: input.reference,
          description: input.description,
          idempotency_key: input.idempotencyKey,
        },
        fetchImpl: this.fetchImpl,
      });

      if (!res.ok) {
        return fail(`http_${res.status}`, "Fawri+ transfer failed", res.body);
      }

      const status = String(res.body.status ?? "PENDING");
      const mapped = mapFawriStatus(status);
      return {
        provider: this.id,
        success: mapped.success,
        status: mapped.status,
        providerRef: res.body.id ? String(res.body.id) : undefined,
        providerResponse: { id: res.body.id, status },
        errorCode: mapped.success ? undefined : status,
        errorMessage: mapped.success ? undefined : `Fawri+ status: ${status}`,
      };
    } catch (e) {
      return fail("network_error", (e as Error).message);
    }
  }

  async refund(providerRef: string, amount: number): Promise<ChargeResult> {
    if (!this.cfg.apiKey) return fail("config_error", "FAWRI_API_KEY is not configured");
    try {
      const res = await httpJson<Record<string, unknown>>({
        method: "POST",
        url: `${this.cfg.apiBase}/v1/transfers/${providerRef}/reversals`,
        headers: this.authHeaders(),
        body: { amount },
        fetchImpl: this.fetchImpl,
      });
      if (!res.ok) return fail(`http_${res.status}`, "Fawri+ reversal failed", res.body);
      return {
        provider: this.id,
        success: true,
        status: "refunded",
        providerRef,
        providerResponse: res.body,
      };
    } catch (e) {
      return fail("network_error", (e as Error).message);
    }
  }

  async verifyWebhook(rawBody: string, signature: string): Promise<Record<string, unknown>> {
    if (!verifyFawriSignature(rawBody, signature, this.cfg.webhookSecret)) {
      throw new Error("Invalid Fawri+ webhook signature");
    }
    return JSON.parse(rawBody) as Record<string, unknown>;
  }
}

function fail(code: string, message: string, response?: unknown): ChargeResult {
  return {
    provider: "fawri",
    success: false,
    status: "failed",
    errorCode: code,
    errorMessage: message,
    providerResponse: response as Record<string, unknown> | undefined,
  };
}

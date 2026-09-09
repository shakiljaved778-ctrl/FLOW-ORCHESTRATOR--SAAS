import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentProvider } from "./provider.interface";
import type { ChargeInput, ChargeResult, PaymentStatus } from "@/lib/orchestration/types";
import { httpJson, type FetchImpl } from "./http";

/**
 * Checkout.com adapter (MENA acquiring). Implemented against the Checkout.com
 * Unified Payments API (api.sandbox.checkout.com). Card data is never handled
 * server-side: the platform tokenizes client-side (Frames/Web SDK) and passes
 * the resulting token as `metadata.source`. A configurable sandbox test token
 * is used as a fallback so the sandbox flow works end to end.
 *
 * Docs: https://api-reference.checkout.com/#operation/requestAPaymentOrPayout
 */

export interface CheckoutConfig {
  secretKey: string;
  /** Signing key from the webhook/workflow configuration. */
  webhookSecret: string;
  apiBase: string;
  /** Sandbox test token used when the request carries no `metadata.source`. */
  testSource: string;
}

function configFromEnv(overrides?: Partial<CheckoutConfig>): CheckoutConfig {
  return {
    secretKey: overrides?.secretKey ?? process.env.CHECKOUT_SECRET_KEY ?? "",
    webhookSecret: overrides?.webhookSecret ?? process.env.CHECKOUT_WEBHOOK_SECRET ?? "",
    apiBase: overrides?.apiBase ?? process.env.CHECKOUT_API_BASE ?? "https://api.sandbox.checkout.com",
    // Checkout.com's documented sandbox test token for a successful Visa.
    testSource: overrides?.testSource ?? process.env.CHECKOUT_TEST_SOURCE ?? "tok_4gzeau5o2uqubbk6fufs3m7p54",
  };
}

/** Map a Checkout.com payment status to our normalized PaymentStatus. */
export function mapCheckoutStatus(status: string): { status: PaymentStatus; success: boolean } {
  switch (status) {
    case "Authorized":
    case "Captured":
    case "Paid":
    case "Card Verified":
      return { status: "succeeded", success: true };
    case "Pending":
      return { status: "processing", success: false };
    case "Refunded":
      return { status: "refunded", success: true };
    default: // Declined, Expired, Canceled, Voided, ...
      return { status: "failed", success: false };
  }
}

/** Verify a Checkout.com webhook signature (HMAC-SHA256 hex of the raw body). */
export function verifyCheckoutSignature(rawBody: string, signature: string, secret: string): boolean {
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export class CheckoutProvider implements PaymentProvider {
  readonly id = "checkout" as const;
  private cfg: CheckoutConfig;
  private fetchImpl?: FetchImpl;

  constructor(cfg?: Partial<CheckoutConfig>, deps?: { fetchImpl?: FetchImpl }) {
    this.cfg = configFromEnv(cfg);
    this.fetchImpl = deps?.fetchImpl;
  }

  private authHeaders(idempotencyKey?: string): Record<string, string> {
    const h: Record<string, string> = { Authorization: `Bearer ${this.cfg.secretKey}` };
    if (idempotencyKey) h["Cko-Idempotency-Key"] = idempotencyKey;
    return h;
  }

  async charge(input: ChargeInput): Promise<ChargeResult> {
    if (!this.cfg.secretKey) {
      return fail("config_error", "CHECKOUT_SECRET_KEY is not configured");
    }
    const token = (input.metadata?.source as string | undefined) ?? this.cfg.testSource;

    try {
      const res = await httpJson<Record<string, unknown>>({
        method: "POST",
        url: `${this.cfg.apiBase}/payments`,
        headers: this.authHeaders(input.idempotencyKey),
        body: {
          source: { type: "token", token },
          amount: input.amount, // minor units — matches Checkout.com
          currency: input.currency,
          reference: input.reference,
          capture: true,
        },
        fetchImpl: this.fetchImpl,
      });

      if (!res.ok) {
        const errCode = String((res.body as { error_type?: string }).error_type ?? `http_${res.status}`);
        return fail(errCode, `Checkout.com payment failed (${res.status})`, res.body);
      }

      const status = String(res.body.status ?? "Pending");
      const mapped = mapCheckoutStatus(status);
      return {
        provider: this.id,
        success: mapped.success,
        status: mapped.status,
        providerRef: res.body.id ? String(res.body.id) : undefined,
        providerResponse: { id: res.body.id, status },
        errorCode: mapped.success ? undefined : status,
        errorMessage: mapped.success ? undefined : `Checkout.com status: ${status}`,
      };
    } catch (e) {
      return fail("network_error", (e as Error).message);
    }
  }

  async refund(providerRef: string, amount: number): Promise<ChargeResult> {
    if (!this.cfg.secretKey) return fail("config_error", "CHECKOUT_SECRET_KEY is not configured");
    try {
      const res = await httpJson<Record<string, unknown>>({
        method: "POST",
        url: `${this.cfg.apiBase}/payments/${providerRef}/refunds`,
        headers: this.authHeaders(),
        body: { amount },
        fetchImpl: this.fetchImpl,
      });
      if (!res.ok) return fail(`http_${res.status}`, "Checkout.com refund failed", res.body);
      return {
        provider: this.id,
        success: true,
        status: "refunded",
        providerRef: res.body.action_id ? String(res.body.action_id) : providerRef,
        providerResponse: res.body,
      };
    } catch (e) {
      return fail("network_error", (e as Error).message);
    }
  }

  async verifyWebhook(rawBody: string, signature: string): Promise<Record<string, unknown>> {
    if (!verifyCheckoutSignature(rawBody, signature, this.cfg.webhookSecret)) {
      throw new Error("Invalid Checkout.com webhook signature");
    }
    return JSON.parse(rawBody) as Record<string, unknown>;
  }
}

function fail(code: string, message: string, response?: unknown): ChargeResult {
  return {
    provider: "checkout",
    success: false,
    status: "failed",
    errorCode: code,
    errorMessage: message,
    providerResponse: response as Record<string, unknown> | undefined,
  };
}

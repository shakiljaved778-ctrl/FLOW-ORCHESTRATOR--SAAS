import Stripe from "stripe";
import type { PaymentProvider } from "./provider.interface";
import type { ChargeInput, ChargeResult } from "@/lib/orchestration/types";

/**
 * Stripe adapter — the only live provider in MVP week 1 (sandbox / test mode).
 * Uses PaymentIntents with automatic confirmation. Amounts are already in minor
 * units, which is exactly what Stripe expects.
 */
export class StripeProvider implements PaymentProvider {
  readonly id = "stripe" as const;
  private client: Stripe;
  private webhookSecret: string;

  constructor(secretKey = process.env.STRIPE_SECRET_KEY, webhookSecret = process.env.STRIPE_WEBHOOK_SECRET) {
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    this.client = new Stripe(secretKey, { apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion });
    this.webhookSecret = webhookSecret ?? "";
  }

  async charge(input: ChargeInput): Promise<ChargeResult> {
    try {
      const intent = await this.client.paymentIntents.create(
        {
          amount: input.amount,
          currency: input.currency.toLowerCase(),
          description: input.description,
          metadata: normalizeMetadata(input.metadata, input.reference),
          // Server-side confirmation with a test payment method for sandbox flows.
          confirm: true,
          payment_method: "pm_card_visa",
          automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        },
        input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
      );

      const succeeded = intent.status === "succeeded";
      return {
        provider: this.id,
        success: succeeded,
        status: succeeded ? "succeeded" : "failed",
        providerRef: intent.id,
        providerResponse: { id: intent.id, status: intent.status },
        errorCode: succeeded ? undefined : intent.status,
        errorMessage: succeeded ? undefined : `PaymentIntent status: ${intent.status}`,
      };
    } catch (err) {
      // Expected declines / API errors → failover-eligible result, not a throw.
      const e = err as Stripe.errors.StripeError;
      return {
        provider: this.id,
        success: false,
        status: "failed",
        errorCode: e.code ?? e.type ?? "stripe_error",
        errorMessage: e.message ?? "Stripe charge failed",
      };
    }
  }

  async refund(providerRef: string, amount: number): Promise<ChargeResult> {
    try {
      const refund = await this.client.refunds.create({
        payment_intent: providerRef,
        amount,
      });
      return {
        provider: this.id,
        success: refund.status === "succeeded" || refund.status === "pending",
        status: "refunded",
        providerRef: refund.id,
        providerResponse: { id: refund.id, status: refund.status },
      };
    } catch (err) {
      const e = err as Stripe.errors.StripeError;
      return {
        provider: this.id,
        success: false,
        status: "failed",
        errorCode: e.code ?? "refund_error",
        errorMessage: e.message ?? "Stripe refund failed",
      };
    }
  }

  async verifyWebhook(rawBody: string, signature: string): Promise<Record<string, unknown>> {
    if (!this.webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
    }
    const event = this.client.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    return event as unknown as Record<string, unknown>;
  }
}

function normalizeMetadata(
  metadata: Record<string, unknown> | undefined,
  reference: string | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (reference) out.reference = reference;
  if (metadata) {
    for (const [k, v] of Object.entries(metadata)) {
      out[k] = typeof v === "string" ? v : JSON.stringify(v);
    }
  }
  return out;
}

import type { PaymentProvider } from "./provider.interface";
import type { ChargeInput, ChargeResult } from "@/lib/orchestration/types";

/**
 * Checkout.com adapter (MENA acquiring). STUB — comes online in MVP weeks 3-4.
 *
 * Implements the PaymentProvider contract so the router/retry engine can be
 * built and tested against it now. Every method throws `NOT_IMPLEMENTED` so it
 * is never accidentally routed to before the real integration lands (kept out
 * of `enabledProviders()` until then).
 */
export class CheckoutProvider implements PaymentProvider {
  readonly id = "checkout" as const;

  async charge(_input: ChargeInput): Promise<ChargeResult> {
    return notImplemented(this.id);
  }

  async refund(_providerRef: string, _amount: number): Promise<ChargeResult> {
    return notImplemented(this.id);
  }

  async verifyWebhook(_rawBody: string, _signature: string): Promise<Record<string, unknown>> {
    throw new Error("Checkout.com webhook verification not implemented (week 3-4).");
  }
}

function notImplemented(provider: "checkout"): ChargeResult {
  return {
    provider,
    success: false,
    status: "failed",
    errorCode: "NOT_IMPLEMENTED",
    errorMessage: "Checkout.com adapter is not implemented yet (planned for weeks 3-4).",
  };
}

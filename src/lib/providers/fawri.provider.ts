import type { PaymentProvider } from "./provider.interface";
import type { ChargeInput, ChargeResult } from "@/lib/orchestration/types";

/**
 * Fawri+ adapter (Qatar local instant transfers). STUB — comes online in MVP
 * weeks 3-4. Implements the PaymentProvider contract for router/retry testing;
 * kept out of `enabledProviders()` until the real integration lands.
 */
export class FawriProvider implements PaymentProvider {
  readonly id = "fawri" as const;

  async charge(_input: ChargeInput): Promise<ChargeResult> {
    return notImplemented();
  }

  async refund(_providerRef: string, _amount: number): Promise<ChargeResult> {
    return notImplemented();
  }

  async verifyWebhook(_rawBody: string, _signature: string): Promise<Record<string, unknown>> {
    throw new Error("Fawri+ webhook verification not implemented (week 3-4).");
  }
}

function notImplemented(): ChargeResult {
  return {
    provider: "fawri",
    success: false,
    status: "failed",
    errorCode: "NOT_IMPLEMENTED",
    errorMessage: "Fawri+ adapter is not implemented yet (planned for weeks 3-4).",
  };
}

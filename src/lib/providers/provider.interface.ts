import type { ChargeInput, ChargeResult, PSP } from "@/lib/orchestration/types";

/**
 * Every PSP adapter implements this interface. The orchestrator only ever talks
 * to providers through it, so adding Checkout.com / Fawri+ in weeks 3-4 is a
 * drop-in: implement these three methods and register the adapter.
 */
export interface PaymentProvider {
  readonly id: PSP;

  /** Attempt to charge. Must never throw for expected declines — return a
   *  ChargeResult with success:false so the retry engine can fail over. */
  charge(input: ChargeInput): Promise<ChargeResult>;

  /** Refund a previously-succeeded charge by its provider reference. */
  refund(providerRef: string, amount: number): Promise<ChargeResult>;

  /** Verify a webhook signature and return the raw event, or throw if invalid. */
  verifyWebhook(rawBody: string, signature: string): Promise<Record<string, unknown>>;
}

/** Registry of instantiated providers, keyed by id. */
export type ProviderRegistry = Partial<Record<PSP, PaymentProvider>>;

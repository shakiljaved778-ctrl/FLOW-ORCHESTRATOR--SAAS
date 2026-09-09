import type { PaymentProvider, ProviderRegistry } from "./provider.interface";
import type { PSP } from "@/lib/orchestration/types";
import { StripeProvider } from "./stripe.provider";
import { CheckoutProvider } from "./checkout.provider";
import { FawriProvider } from "./fawri.provider";

export type { PaymentProvider, ProviderRegistry } from "./provider.interface";

/**
 * Lazily build the registry of provider adapters. Instantiation is deferred and
 * guarded so a missing secret for a not-yet-enabled provider never crashes the
 * request path — only the providers actually asked for are constructed.
 */
const factories: Record<PSP, () => PaymentProvider> = {
  stripe: () => new StripeProvider(),
  checkout: () => new CheckoutProvider(),
  fawri: () => new FawriProvider(),
};

const cache: ProviderRegistry = {};

export function getProvider(id: PSP): PaymentProvider {
  if (!cache[id]) {
    cache[id] = factories[id]();
  }
  return cache[id]!;
}

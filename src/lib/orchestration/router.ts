import type { Currency, PSP, RoutingDecision } from "./types";
import {
  CURRENCY_ROUTING,
  PROVIDER_MAX_AMOUNT,
  enabledProviders,
} from "@/config/psp.config";

export interface RouteParams {
  currency: Currency;
  /** Amount in minor units. */
  amount: number;
  /** Override the set of currently-available providers (defaults to config). */
  available?: PSP[];
}

/**
 * Decide the ordered list of PSPs to attempt for a payment.
 *
 * The primary is the first entry; the rest form the failover chain used by the
 * retry engine. A provider is a candidate only if it is:
 *   1. preferred for the currency (in CURRENCY_ROUTING),
 *   2. enabled in this deployment,
 *   3. able to handle the amount (below any per-provider cap).
 *
 * Throws if no provider can serve the request.
 */
export function route(params: RouteParams): RoutingDecision {
  const { currency, amount } = params;
  const available = params.available ?? enabledProviders();

  if (amount <= 0) {
    throw new Error("Amount must be a positive integer (minor units).");
  }

  const preference = CURRENCY_ROUTING[currency];
  if (!preference) {
    throw new Error(`No routing configured for currency ${currency}`);
  }

  const availableSet = new Set(available);

  const candidates = preference.filter((psp) => {
    if (!availableSet.has(psp)) return false;
    const cap = PROVIDER_MAX_AMOUNT[psp];
    if (cap !== undefined && amount > cap) return false;
    return true;
  });

  if (candidates.length === 0) {
    throw new Error(
      `No available provider can process ${amount} ${currency}. ` +
        `Preferred: [${preference.join(", ")}], enabled: [${available.join(", ")}].`,
    );
  }

  return {
    candidates,
    reason:
      `Routed ${currency} ${amount} → ${candidates[0]} ` +
      `(failover: ${candidates.slice(1).join(", ") || "none"})`,
  };
}

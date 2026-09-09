import type { Currency, PSP } from "@/lib/orchestration/types";

/**
 * Routing configuration. Declares, per currency, the ordered preference of
 * PSPs. The router walks this list, skipping providers that are unavailable or
 * cannot handle the amount, to produce the failover chain.
 *
 * Rationale:
 *  - QAR: Fawri+ (local Qatar rails, lowest cost) → Checkout.com (MENA) → Stripe
 *  - AED: Checkout.com (strong MENA acquiring) → Stripe
 *  - USD: Stripe (global cards) → Checkout.com
 */
export const CURRENCY_ROUTING: Record<Currency, PSP[]> = {
  QAR: ["fawri", "checkout", "stripe"],
  AED: ["checkout", "stripe"],
  USD: ["stripe", "checkout"],
};

/**
 * Which providers are actually enabled in this deployment. Checkout.com and
 * Fawri+ come online in weeks 3-4; until then only Stripe processes live.
 * Toggle via env so staging can enable them independently.
 */
export function enabledProviders(): PSP[] {
  const flag = (name: string, dflt: boolean) => {
    const v = process.env[name];
    if (v === undefined) return dflt;
    return v === "1" || v.toLowerCase() === "true";
  };
  const providers: PSP[] = [];
  if (flag("PSP_STRIPE_ENABLED", true)) providers.push("stripe");
  if (flag("PSP_CHECKOUT_ENABLED", false)) providers.push("checkout");
  if (flag("PSP_FAWRI_ENABLED", false)) providers.push("fawri");
  return providers;
}

/** Per-provider maximum single-transaction amount (minor units), if any. */
export const PROVIDER_MAX_AMOUNT: Partial<Record<PSP, number>> = {
  // Fawri+ local transfers cap at QAR 100,000 for MVP.
  fawri: 10_000_000,
};

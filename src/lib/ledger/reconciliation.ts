import type { SupabaseClient } from "@supabase/supabase-js";

/** A settlement line from a PSP report, normalized. */
export interface SettlementRecord {
  provider: string;
  providerRef: string;
  amount: number; // minor units
  currency: string;
}

export interface ReconciliationResult {
  matched: string[]; // payment ids reconciled to a settlement
  unmatchedPayments: string[]; // succeeded payments with no settlement line
  unmatchedSettlements: SettlementRecord[]; // settlement lines with no payment
}

/**
 * Reconcile succeeded payments against a batch of PSP settlement records.
 *
 * Matching key is (provider, providerRef) with an amount check. Anything that
 * doesn't line up is surfaced for the dashboard's reconciliation view.
 */
export async function reconcile(
  db: SupabaseClient,
  orgId: string,
  settlements: SettlementRecord[],
): Promise<ReconciliationResult> {
  // Pull succeeded payments and their winning attempt's provider_ref.
  const { data: attempts, error } = await db
    .from("payment_attempts")
    .select("payment_id, provider, provider_ref, status, payments!inner(org_id, amount, currency, status)")
    .eq("status", "succeeded")
    .eq("payments.org_id", orgId)
    .eq("payments.status", "succeeded");

  if (error) {
    throw new Error(`Reconciliation query failed: ${error.message}`);
  }

  const settlementByRef = new Map(settlements.map((s) => [`${s.provider}:${s.providerRef}`, s]));
  const matched: string[] = [];
  const unmatchedPayments: string[] = [];
  const usedRefs = new Set<string>();

  for (const a of (attempts ?? []) as unknown as Array<{
    payment_id: string;
    provider: string;
    provider_ref: string | null;
    payments: { amount: number; currency: string };
  }>) {
    if (!a.provider_ref) {
      unmatchedPayments.push(a.payment_id);
      continue;
    }
    const key = `${a.provider}:${a.provider_ref}`;
    const settlement = settlementByRef.get(key);
    if (settlement && settlement.amount === a.payments.amount && settlement.currency === a.payments.currency) {
      matched.push(a.payment_id);
      usedRefs.add(key);
    } else {
      unmatchedPayments.push(a.payment_id);
    }
  }

  const unmatchedSettlements = settlements.filter(
    (s) => !usedRefs.has(`${s.provider}:${s.providerRef}`),
  );

  return { matched, unmatchedPayments, unmatchedSettlements };
}

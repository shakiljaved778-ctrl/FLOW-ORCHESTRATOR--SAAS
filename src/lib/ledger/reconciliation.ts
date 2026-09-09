import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { matchSettlements, type PaymentRef } from "./settlement";

/** A settlement line from a PSP report, normalized. */
export interface SettlementRecord {
  provider: string;
  providerRef: string;
  amount: number; // minor units
  currency: string;
}

export interface ReconciliationResult {
  batchId: string;
  matched: string[]; // payment ids reconciled to a settlement
  discrepancies: string[]; // payment ids matched by ref but with amount/ccy mismatch
  unmatchedPayments: string[]; // succeeded payments with no settlement line
  unmatchedSettlements: SettlementRecord[]; // settlement lines with no payment
}

/** Load succeeded payments (with their winning attempt's provider ref) for an org. */
async function loadSettlingPayments(db: SupabaseClient, orgId: string): Promise<PaymentRef[]> {
  const { data, error } = await db
    .from("payment_attempts")
    .select("payment_id, provider, provider_ref, status, payments!inner(org_id, amount, currency, status)")
    .eq("status", "succeeded")
    .eq("payments.org_id", orgId)
    .eq("payments.status", "succeeded");

  if (error) throw new Error(`Reconciliation query failed: ${error.message}`);

  return ((data ?? []) as unknown as Array<{
    payment_id: string;
    provider: string;
    provider_ref: string | null;
    payments: { amount: number; currency: string };
  }>).map((a) => ({
    paymentId: a.payment_id,
    provider: a.provider,
    providerRef: a.provider_ref,
    amount: a.payments.amount,
    currency: a.payments.currency,
  }));
}

/**
 * Reconcile succeeded payments against an in-memory batch of settlement records
 * (no persistence). Used for previews.
 */
export async function reconcile(
  db: SupabaseClient,
  orgId: string,
  settlements: SettlementRecord[],
): Promise<ReconciliationResult> {
  const payments = await loadSettlingPayments(db, orgId);
  const m = matchSettlements(payments, settlements);
  return {
    batchId: "preview",
    matched: m.matched.map((x) => x.paymentId),
    discrepancies: m.discrepancies.map((x) => x.paymentId),
    unmatchedPayments: m.unmatchedPayments,
    unmatchedSettlements: m.unmatchedSettlements,
  };
}

/**
 * Ingest an uploaded settlement batch: persist the rows, match them against the
 * org's succeeded payments, and record each row's status. Returns the summary.
 */
export async function ingestSettlements(
  db: SupabaseClient,
  orgId: string,
  settlements: SettlementRecord[],
): Promise<ReconciliationResult> {
  const batchId = randomUUID();
  const payments = await loadSettlingPayments(db, orgId);
  const m = matchSettlements(payments, settlements);

  // Build a per-key status + matched payment id map from the match result.
  const keyed = new Map<string, { status: "matched" | "discrepancy"; paymentId: string }>();
  for (const x of m.matched) {
    keyed.set(`${x.settlement.provider}:${x.settlement.providerRef}`, {
      status: "matched",
      paymentId: x.paymentId,
    });
  }
  for (const x of m.discrepancies) {
    keyed.set(`${x.settlement.provider}:${x.settlement.providerRef}`, {
      status: "discrepancy",
      paymentId: x.paymentId,
    });
  }

  const rows = settlements.map((s) => {
    const hit = keyed.get(`${s.provider}:${s.providerRef}`);
    return {
      org_id: orgId,
      provider: s.provider,
      provider_ref: s.providerRef,
      amount: s.amount,
      currency: s.currency,
      status: hit?.status ?? "unmatched",
      matched_payment_id: hit?.paymentId ?? null,
      batch_id: batchId,
    };
  });

  if (rows.length > 0) {
    // Upsert so re-uploading the same reference refreshes its match status.
    const { error } = await db
      .from("settlements")
      .upsert(rows, { onConflict: "org_id,provider,provider_ref" });
    if (error) throw new Error(`Failed to persist settlements: ${error.message}`);
  }

  return {
    batchId,
    matched: m.matched.map((x) => x.paymentId),
    discrepancies: m.discrepancies.map((x) => x.paymentId),
    unmatchedPayments: m.unmatchedPayments,
    unmatchedSettlements: m.unmatchedSettlements,
  };
}

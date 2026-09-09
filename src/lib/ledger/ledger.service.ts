import type { SupabaseClient } from "@supabase/supabase-js";
import type { JournalEntryInput, LineItemInput } from "./types";
import { sanitize } from "@/lib/audit/sanitize";

/**
 * Pure check: a set of line items is balanced iff total debits equal total
 * credits and every line is one-sided with a non-negative amount. This mirrors
 * the database constraint trigger and is the invariant every test asserts.
 */
export function isBalanced(lines: LineItemInput[]): boolean {
  if (lines.length < 2) return false;
  let debit = 0;
  let credit = 0;
  for (const l of lines) {
    if (l.debit < 0 || l.credit < 0) return false;
    const oneSided = (l.debit > 0 && l.credit === 0) || (l.credit > 0 && l.debit === 0);
    if (!oneSided) return false;
    debit += l.debit;
    credit += l.credit;
  }
  return debit === credit;
}

export function assertBalanced(lines: LineItemInput[]): void {
  if (!isBalanced(lines)) {
    throw new Error("Journal entry is not balanced: debits must equal credits.");
  }
}

/**
 * Build the standard double-entry for a captured payment:
 *   debit  Accounts Receivable (asset increases)
 *   credit Revenue             (revenue increases)
 * Both legs in the same currency and amount (minor units).
 */
export function buildPaymentEntry(params: {
  orgId: string;
  amount: number;
  currency: string;
  accountsReceivableId: string;
  revenueId: string;
  transactionId?: string;
  userId?: string;
  provider?: string;
  providerResponse?: Record<string, unknown>;
}): JournalEntryInput {
  const lines: LineItemInput[] = [
    {
      accountId: params.accountsReceivableId,
      debit: params.amount,
      credit: 0,
      currency: params.currency,
      memo: "Payment received",
    },
    {
      accountId: params.revenueId,
      debit: 0,
      credit: params.amount,
      currency: params.currency,
      memo: "Revenue recognized",
    },
  ];
  assertBalanced(lines);
  return {
    orgId: params.orgId,
    description: "Payment capture",
    transactionId: params.transactionId,
    userId: params.userId,
    provider: params.provider,
    providerResponse: params.providerResponse,
    lines,
  };
}

/**
 * Post a journal entry to the ledger atomically via the `post_journal_entry`
 * Postgres function (see migration 0007). The header and all legs are inserted
 * in one transaction, and the deferred balance constraint is forced to check
 * before the function returns — so a partial or unbalanced entry can never be
 * persisted. Provider responses are sanitized before storage.
 *
 * `assertBalanced` here is a fast client-side pre-check; the database function
 * is the authoritative guard.
 */
export async function postJournalEntry(
  db: SupabaseClient,
  entry: JournalEntryInput,
): Promise<{ entryId: string }> {
  assertBalanced(entry.lines);

  const { data, error } = await db.rpc("post_journal_entry", {
    p_org_id: entry.orgId,
    p_description: entry.description,
    p_lines: entry.lines.map((l) => ({
      account_id: l.accountId,
      debit: l.debit,
      credit: l.credit,
      currency: l.currency,
      memo: l.memo ?? null,
    })),
    p_transaction_id: entry.transactionId ?? null,
    p_user_id: entry.userId ?? null,
    p_provider: entry.provider ?? null,
    p_provider_response: entry.providerResponse ? sanitize(entry.providerResponse) : null,
  });

  if (error) {
    throw new Error(`Failed to post journal entry: ${error.message}`);
  }

  return { entryId: data as string };
}

/** Look up an account id by (org, code, currency). */
export async function findAccountId(
  db: SupabaseClient,
  orgId: string,
  code: string,
  currency: string,
): Promise<string> {
  const { data, error } = await db
    .from("accounts")
    .select("id")
    .eq("org_id", orgId)
    .eq("code", code)
    .eq("currency", currency)
    .single();
  if (error || !data) {
    throw new Error(`Account ${code}/${currency} not found for org ${orgId}`);
  }
  return data.id as string;
}

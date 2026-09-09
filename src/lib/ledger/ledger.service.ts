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
 * Post a journal entry to the ledger. The header and its line items are written
 * with the service-role client; the deferred DB balance trigger provides a
 * second, authoritative guard. Provider responses are sanitized before storage.
 *
 * Note: for true atomicity across the header + legs, deploy this as a Postgres
 * RPC (`post_journal_entry`) wrapping both inserts in one transaction. The
 * two-step insert here is the MVP path and is backstopped by the deferred
 * balance constraint, which rejects an unbalanced entry at commit.
 */
export async function postJournalEntry(
  db: SupabaseClient,
  entry: JournalEntryInput,
): Promise<{ entryId: string }> {
  assertBalanced(entry.lines);

  const { data: header, error: headerErr } = await db
    .from("journal_entries")
    .insert({
      org_id: entry.orgId,
      description: entry.description,
      transaction_id: entry.transactionId ?? null,
      user_id: entry.userId ?? null,
      provider: entry.provider ?? null,
      provider_response: entry.providerResponse ? sanitize(entry.providerResponse) : null,
    })
    .select("id")
    .single();

  if (headerErr || !header) {
    throw new Error(`Failed to create journal entry: ${headerErr?.message}`);
  }

  const { error: linesErr } = await db.from("line_items").insert(
    entry.lines.map((l) => ({
      entry_id: header.id,
      account_id: l.accountId,
      debit: l.debit,
      credit: l.credit,
      currency: l.currency,
      memo: l.memo ?? null,
    })),
  );

  if (linesErr) {
    throw new Error(`Failed to post line items: ${linesErr.message}`);
  }

  return { entryId: header.id as string };
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

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { postJournalEntry, buildPaymentEntry } from "@/lib/ledger/ledger.service";

/** Minimal Supabase mock exposing only `rpc`. */
function mockDb(rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>) {
  const spy = vi.fn(rpc);
  return { db: { rpc: spy } as unknown as SupabaseClient, spy };
}

const entry = buildPaymentEntry({
  orgId: "org_1",
  amount: 15000,
  currency: "QAR",
  accountsReceivableId: "acc_ar",
  revenueId: "acc_rev",
  transactionId: "pay_1",
  provider: "stripe",
});

describe("postJournalEntry (transactional RPC)", () => {
  it("calls post_journal_entry with mapped params and returns the entry id", async () => {
    const { db, spy } = mockDb(async () => ({ data: "entry_abc", error: null }));

    const result = await postJournalEntry(db, entry);

    expect(result.entryId).toBe("entry_abc");
    expect(spy).toHaveBeenCalledTimes(1);
    const [fn, args] = spy.mock.calls[0];
    expect(fn).toBe("post_journal_entry");
    expect(args).toMatchObject({
      p_org_id: "org_1",
      p_description: "Payment capture",
      p_transaction_id: "pay_1",
      p_provider: "stripe",
    });
    // Lines mapped to the DB's snake_case shape.
    expect((args as { p_lines: unknown[] }).p_lines).toEqual([
      { account_id: "acc_ar", debit: 15000, credit: 0, currency: "QAR", memo: "Payment received" },
      { account_id: "acc_rev", debit: 0, credit: 15000, currency: "QAR", memo: "Revenue recognized" },
    ]);
  });

  it("throws when the RPC returns an error", async () => {
    const { db } = mockDb(async () => ({ data: null, error: { message: "Unbalanced journal entry" } }));
    await expect(postJournalEntry(db, entry)).rejects.toThrow(/Unbalanced journal entry/);
  });

  it("rejects an unbalanced entry client-side without calling the RPC", async () => {
    const { db, spy } = mockDb(async () => ({ data: "x", error: null }));
    const bad = {
      ...entry,
      lines: [
        { accountId: "a", debit: 100, credit: 0, currency: "QAR" },
        { accountId: "b", debit: 0, credit: 90, currency: "QAR" },
      ],
    };
    await expect(postJournalEntry(db, bad)).rejects.toThrow(/not balanced/);
    expect(spy).not.toHaveBeenCalled();
  });
});

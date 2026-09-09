import { getDashboardData } from "@/lib/dashboard/context";
import { PageHeader, Table, Money, EmptyState } from "@/components/dashboard/ui";

export const dynamic = "force-dynamic";

interface LineRow {
  id: string;
  debit: number;
  credit: number;
  currency: string;
  memo: string | null;
  accounts: { code: string; name: string } | null;
  journal_entries: { id: string; description: string; provider: string | null; entry_date: string } | null;
}

export default async function LedgerPage() {
  const { db, orgId } = await getDashboardData();

  // Journal entries for this org, with their line items and account names.
  const { data: entries } = await db
    .from("journal_entries")
    .select("id, description, provider, entry_date, transaction_id")
    .eq("org_id", orgId)
    .order("entry_date", { ascending: false })
    .limit(100);

  const entryIds = (entries ?? []).map((e) => e.id);
  const { data: lines } = entryIds.length
    ? await db
        .from("line_items")
        .select("id, debit, credit, currency, memo, entry_id, accounts(code, name)")
        .in("entry_id", entryIds)
    : { data: [] as unknown[] };

  const byEntry = new Map<string, LineRow[]>();
  for (const l of (lines ?? []) as unknown as (LineRow & { entry_id: string })[]) {
    const arr = byEntry.get(l.entry_id) ?? [];
    arr.push(l);
    byEntry.set(l.entry_id, arr);
  }

  return (
    <div>
      <PageHeader
        title="Ledger"
        subtitle="Double-entry journal — every payment posts a balanced debit and credit."
      />
      {(entries ?? []).length === 0 ? (
        <EmptyState message="No journal entries yet." />
      ) : (
        <div className="space-y-4">
          {(entries ?? []).map((e) => (
            <div key={e.id} className="card">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <span className="font-medium text-slate-900">{e.description}</span>
                  <span className="ml-2 text-xs text-slate-400">
                    {new Date(e.entry_date).toLocaleString()} · {e.provider ?? "system"}
                  </span>
                </div>
                <span className="font-mono text-xs text-slate-400">{e.id.slice(0, 8)}</span>
              </div>
              <Table head={["Account", "Debit", "Credit", "Memo"]}>
                {(byEntry.get(e.id) ?? []).map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2">
                      {l.accounts ? `${l.accounts.code} · ${l.accounts.name}` : "—"}
                    </td>
                    <td className="px-4 py-2">{l.debit > 0 ? <Money minor={l.debit} currency={l.currency} /> : "—"}</td>
                    <td className="px-4 py-2">{l.credit > 0 ? <Money minor={l.credit} currency={l.currency} /> : "—"}</td>
                    <td className="px-4 py-2 text-slate-500">{l.memo ?? "—"}</td>
                  </tr>
                ))}
              </Table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

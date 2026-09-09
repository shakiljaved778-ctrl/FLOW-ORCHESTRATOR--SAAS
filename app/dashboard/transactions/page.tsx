import { getDashboardData } from "@/lib/dashboard/context";
import { PageHeader, Table, StatusBadge, Money, EmptyState } from "@/components/dashboard/ui";
import { RealtimeRefresher } from "@/components/dashboard/realtime-refresher";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const { db, orgId } = await getDashboardData();

  const { data: payments } = await db
    .from("payments")
    .select("id, amount, currency, status, routed_provider, reference, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = payments ?? [];

  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle="Every payment, its routing decision, and provider outcome."
        action={<RealtimeRefresher table="payments" />}
      />
      {rows.length === 0 ? (
        <EmptyState message="No transactions to display yet." />
      ) : (
        <Table head={["Payment", "Reference", "Amount", "Provider", "Status", "Created"]}>
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.id.slice(0, 8)}</td>
              <td className="px-4 py-3">{p.reference ?? "—"}</td>
              <td className="px-4 py-3"><Money minor={p.amount} currency={p.currency} /></td>
              <td className="px-4 py-3">{p.routed_provider ?? "—"}</td>
              <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
              <td className="px-4 py-3 text-slate-500">{new Date(p.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

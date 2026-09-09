import { getDashboardData } from "@/lib/dashboard/context";
import { PageHeader, StatCard, Table, StatusBadge, Money, EmptyState } from "@/components/dashboard/ui";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const { db, orgId } = await getDashboardData();

  const { data: payments } = await db
    .from("payments")
    .select("id, amount, currency, status, routed_provider, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = payments ?? [];
  const total = rows.length;
  const succeeded = rows.filter((p) => p.status === "succeeded").length;
  const successRate = total ? Math.round((succeeded / total) * 100) : 0;
  const volumeByCcy = rows
    .filter((p) => p.status === "succeeded")
    .reduce<Record<string, number>>((acc, p) => {
      acc[p.currency] = (acc[p.currency] ?? 0) + p.amount;
      return acc;
    }, {});

  return (
    <div>
      <PageHeader title="Overview" subtitle="Real-time payment orchestration health." />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Total payments" value={String(total)} />
        <StatCard label="Success rate" value={`${successRate}%`} hint={`${succeeded}/${total} succeeded`} />
        <StatCard
          label="Volume (QAR)"
          value={((volumeByCcy.QAR ?? 0) / 100).toFixed(2)}
          hint="succeeded only"
        />
        <StatCard label="Currencies" value={String(Object.keys(volumeByCcy).length || 0)} />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Recent transactions
        </h2>
        {rows.length === 0 ? (
          <EmptyState message="No payments yet. Send one to POST /api/v1/payments to see it here." />
        ) : (
          <Table head={["Payment", "Amount", "Provider", "Status", "Created"]}>
            {rows.slice(0, 10).map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.id.slice(0, 8)}</td>
                <td className="px-4 py-3"><Money minor={p.amount} currency={p.currency} /></td>
                <td className="px-4 py-3">{p.routed_provider ?? "—"}</td>
                <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                <td className="px-4 py-3 text-slate-500">{new Date(p.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </div>
  );
}

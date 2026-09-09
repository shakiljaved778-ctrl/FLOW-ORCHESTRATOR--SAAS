import { getDashboardData } from "@/lib/dashboard/context";
import { PageHeader, StatCard, Table, Money, EmptyState } from "@/components/dashboard/ui";
import { SettlementUpload } from "@/components/dashboard/settlement-upload";

export const dynamic = "force-dynamic";

/**
 * Reconciliation: upload a PSP settlement file to match it against succeeded
 * payments. Uploaded settlement rows and their match status are shown below.
 */
export default async function ReconciliationPage() {
  const { db, orgId, isAdmin } = await getDashboardData();

  const { data: settlements } = await db
    .from("settlements")
    .select("id, provider, provider_ref, amount, currency, status, matched_payment_id, uploaded_at")
    .eq("org_id", orgId)
    .order("uploaded_at", { ascending: false })
    .limit(200);

  const rows = settlements ?? [];
  const counts = {
    matched: rows.filter((r) => r.status === "matched").length,
    discrepancy: rows.filter((r) => r.status === "discrepancy").length,
    unmatched: rows.filter((r) => r.status === "unmatched").length,
  };

  return (
    <div>
      <PageHeader
        title="Reconciliation"
        subtitle="Match PSP settlement reports to the unified ledger."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Matched" value={String(counts.matched)} />
        <StatCard label="Discrepancies" value={String(counts.discrepancy)} hint="amount/currency mismatch" />
        <StatCard label="Unmatched settlements" value={String(counts.unmatched)} hint="no payment found" />
      </div>

      {isAdmin ? (
        <div className="mb-6">
          <SettlementUpload />
        </div>
      ) : (
        <div className="mb-6">
          <EmptyState message="Only organization admins can upload settlement files." />
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState message="No settlements uploaded yet." />
      ) : (
        <Table head={["Provider", "Provider Ref", "Amount", "Status", "Payment", "Uploaded"]}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-3">{r.provider}</td>
              <td className="px-4 py-3 font-mono text-xs">{r.provider_ref}</td>
              <td className="px-4 py-3"><Money minor={r.amount} currency={r.currency} /></td>
              <td className="px-4 py-3">
                <span className={`badge ${r.status === "matched" ? "badge-success" : r.status === "discrepancy" ? "badge-pending" : "badge-failed"}`}>
                  {r.status}
                </span>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-500">
                {r.matched_payment_id ? String(r.matched_payment_id).slice(0, 8) : "—"}
              </td>
              <td className="px-4 py-3 text-slate-500">{new Date(r.uploaded_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

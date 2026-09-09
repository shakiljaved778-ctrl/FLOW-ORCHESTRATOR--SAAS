import { getDashboardData } from "@/lib/dashboard/context";
import { PageHeader, StatCard, Table, Money, EmptyState } from "@/components/dashboard/ui";

export const dynamic = "force-dynamic";

/**
 * MVP reconciliation view: shows succeeded payments and their winning PSP
 * reference. A settlement-file upload matches these against PSP reports via
 * `reconcile()`; until a batch is uploaded we surface the candidates and flag
 * any succeeded payment missing a provider reference as needing attention.
 */
export default async function ReconciliationPage() {
  const { db, orgId } = await getDashboardData();

  const { data: attempts } = await db
    .from("payment_attempts")
    .select("payment_id, provider, provider_ref, status, payments!inner(org_id, amount, currency, status)")
    .eq("status", "succeeded")
    .eq("payments.org_id", orgId)
    .eq("payments.status", "succeeded")
    .limit(200);

  const rows = (attempts ?? []) as unknown as Array<{
    payment_id: string;
    provider: string;
    provider_ref: string | null;
    payments: { amount: number; currency: string };
  }>;

  const missingRef = rows.filter((r) => !r.provider_ref);

  return (
    <div>
      <PageHeader
        title="Reconciliation"
        subtitle="Match ledger entries to PSP settlement reports."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Settled payments" value={String(rows.length)} />
        <StatCard label="Missing provider ref" value={String(missingRef.length)} hint="need attention" />
        <StatCard label="Unmatched settlements" value="—" hint="upload a settlement file" />
      </div>

      {rows.length === 0 ? (
        <EmptyState message="No settled payments to reconcile yet." />
      ) : (
        <Table head={["Payment", "Provider", "Provider Ref", "Amount", "Reconcilable"]}>
          {rows.map((r) => (
            <tr key={r.payment_id}>
              <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.payment_id.slice(0, 8)}</td>
              <td className="px-4 py-3">{r.provider}</td>
              <td className="px-4 py-3 font-mono text-xs">{r.provider_ref ?? "—"}</td>
              <td className="px-4 py-3"><Money minor={r.payments.amount} currency={r.payments.currency} /></td>
              <td className="px-4 py-3">
                {r.provider_ref ? (
                  <span className="badge badge-success">ready</span>
                ) : (
                  <span className="badge badge-failed">no ref</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

import { getDashboardData } from "@/lib/dashboard/context";
import { PageHeader, Table, EmptyState } from "@/components/dashboard/ui";
import { qatarLocal } from "@/lib/utils/time";

export const dynamic = "force-dynamic";

/** Audit trail explorer. Admin-only — enforced here and by RLS. */
export default async function AuditPage() {
  const { db, orgId, isAdmin } = await getDashboardData();

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Audit trail" />
        <EmptyState message="Only organization admins can view and export audit logs." />
      </div>
    );
  }

  const { data: logs } = await db
    .from("audit_logs")
    .select("id, action, resource_type, resource_id, user_id, occurred_at")
    .eq("org_id", orgId)
    .order("occurred_at", { ascending: false })
    .limit(200);

  const rows = logs ?? [];

  return (
    <div>
      <PageHeader
        title="Audit trail"
        subtitle="Immutable, 7-year-retained event log for QFC compliance."
        action={
          <a
            href="/api/v1/audit/export"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Export CSV
          </a>
        }
      />
      {rows.length === 0 ? (
        <EmptyState message="No audit events recorded yet." />
      ) : (
        <Table head={["Action", "Resource", "Actor", "Time (Qatar)"]}>
          {rows.map((l) => (
            <tr key={l.id}>
              <td className="px-4 py-3 font-medium text-slate-900">{l.action}</td>
              <td className="px-4 py-3 text-slate-500">
                {l.resource_type ? `${l.resource_type} · ${String(l.resource_id).slice(0, 8)}` : "—"}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-500">{l.user_id ?? "system/api"}</td>
              <td className="px-4 py-3 text-slate-500">{qatarLocal(new Date(l.occurred_at))}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

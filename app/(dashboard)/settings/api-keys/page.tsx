import { getDashboardData } from "@/lib/dashboard/context";
import { PageHeader, Table, EmptyState } from "@/components/dashboard/ui";
import { ApiKeyCreator } from "@/components/dashboard/api-key-manager";
import { revokeApiKey } from "@/lib/dashboard/actions";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const { db, orgId, isAdmin } = await getDashboardData();

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="API keys" />
        <EmptyState message="Only organization admins can manage API keys." />
      </div>
    );
  }

  const { data: keys } = await db
    .from("api_keys")
    .select("id, name, key_prefix, scopes, last_used_at, revoked_at, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  const rows = keys ?? [];

  return (
    <div className="max-w-3xl">
      <PageHeader title="API keys" subtitle="Scoped keys for platform integrations." />
      <ApiKeyCreator />

      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState message="No API keys yet." />
        ) : (
          <Table head={["Name", "Prefix", "Scopes", "Last used", "Status", ""]}>
            {rows.map((k) => (
              <tr key={k.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{k.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{k.key_prefix}…</td>
                <td className="px-4 py-3 text-xs text-slate-500">{(k.scopes ?? []).join(", ")}</td>
                <td className="px-4 py-3 text-slate-500">
                  {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "never"}
                </td>
                <td className="px-4 py-3">
                  {k.revoked_at ? (
                    <span className="badge badge-failed">revoked</span>
                  ) : (
                    <span className="badge badge-success">active</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {!k.revoked_at && (
                    <form action={revokeApiKey}>
                      <input type="hidden" name="id" value={k.id} />
                      <button className="text-sm font-medium text-rose-600 hover:underline">
                        Revoke
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </div>
  );
}

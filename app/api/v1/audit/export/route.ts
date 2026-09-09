import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/dashboard/context";
import { recordAudit } from "@/lib/audit/audit.service";
import { qatarLocal } from "@/lib/utils/time";

export const runtime = "nodejs";

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * GET /api/v1/audit/export — CSV export of the org's audit trail.
 * Admin-only (Clerk session). The export action is itself audited.
 */
export async function GET() {
  let ctx;
  try {
    ctx = await getDashboardData();
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!ctx.isAdmin) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const { data: logs } = await ctx.db
    .from("audit_logs")
    .select("action, resource_type, resource_id, user_id, ip_address, occurred_at")
    .eq("org_id", ctx.orgId)
    .order("occurred_at", { ascending: false })
    .limit(10000);

  const header = ["action", "resource_type", "resource_id", "user_id", "ip_address", "occurred_at_utc", "occurred_at_qatar"];
  const lines = [header.join(",")];
  for (const l of logs ?? []) {
    lines.push(
      [
        csvCell(l.action),
        csvCell(l.resource_type),
        csvCell(l.resource_id),
        csvCell(l.user_id),
        csvCell(l.ip_address),
        csvCell(l.occurred_at),
        csvCell(qatarLocal(new Date(l.occurred_at))),
      ].join(","),
    );
  }

  await recordAudit(ctx.db, {
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "audit.exported",
    resourceType: "audit_logs",
    responsePayload: { rows: logs?.length ?? 0 },
  });

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-${ctx.orgId}-${Date.now()}.csv"`,
    },
  });
}

import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/dashboard/context";
import { recordAudit } from "@/lib/audit/audit.service";
import { buildAuditPdf } from "@/lib/audit/pdf";

export const runtime = "nodejs";

/**
 * GET /api/v1/audit/export/pdf — PDF audit report for QFC regulators.
 * Admin-only (Clerk session). The export itself is audited.
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

  const [{ data: org }, { data: logs }] = await Promise.all([
    ctx.db.from("organizations").select("name").eq("id", ctx.orgId).single(),
    ctx.db
      .from("audit_logs")
      .select("action, resource_type, resource_id, user_id, occurred_at")
      .eq("org_id", ctx.orgId)
      .order("occurred_at", { ascending: false })
      .limit(5000),
  ]);

  const pdf = await buildAuditPdf(
    { orgName: org?.name ?? "Unknown", orgId: ctx.orgId, generatedBy: ctx.userId },
    logs ?? [],
  );

  await recordAudit(ctx.db, {
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "audit.exported_pdf",
    resourceType: "audit_logs",
    responsePayload: { rows: logs?.length ?? 0 },
  });

  // Uint8Array → a fresh ArrayBuffer-backed copy for the Response body.
  const bytes = new Uint8Array(pdf);
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="audit-report-${ctx.orgId}-${Date.now()}.pdf"`,
    },
  });
}

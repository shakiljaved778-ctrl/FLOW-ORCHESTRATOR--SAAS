import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/db/client";
import { resolveApiKey, hasScope } from "@/lib/auth/api-key";

export const runtime = "nodejs";

function bearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice("Bearer ".length).trim() || null;
}

/** GET /api/v1/payments/:id — fetch a payment's status and attempts. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = serviceClient();

  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  const key = await resolveApiKey(db, token);
  if (!key) return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  if (!hasScope(key.scopes, "payments:read")) {
    return NextResponse.json({ error: "API key lacks payments:read scope" }, { status: 403 });
  }

  const { data: payment, error } = await db
    .from("payments")
    .select("id, amount, currency, status, routed_provider, reference, created_at")
    .eq("id", id)
    .eq("org_id", key.orgId) // enforce tenancy
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  const { data: attempts } = await db
    .from("payment_attempts")
    .select("provider, attempt_number, status, provider_ref, error_code, created_at")
    .eq("payment_id", id)
    .order("attempt_number", { ascending: true });

  return NextResponse.json({ ...payment, attempts: attempts ?? [] });
}

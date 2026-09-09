import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/db/client";
import { requireDashboardContext, isAdminRole } from "@/lib/auth/clerk";
import { ensureOrgProvisioned } from "./provision";

/**
 * Server-only helper for dashboard pages. Resolves the authenticated Clerk
 * context to an internal org id and returns a service client. Every query in a
 * dashboard page MUST filter by `orgId` — the service client bypasses RLS, so
 * tenancy is enforced here in application code.
 */
export interface DashboardData {
  db: SupabaseClient;
  orgId: string;
  userId: string;
  isAdmin: boolean;
}

export async function getDashboardData(): Promise<DashboardData> {
  const ctx = await requireDashboardContext();
  const db = serviceClient();
  // Provision the org + chart of accounts on first access (idempotent).
  const orgId = await ensureOrgProvisioned(db, ctx.clerkOrgId, ctx.orgName);
  return { db, orgId, userId: ctx.userId, isAdmin: isAdminRole(ctx.orgRole) };
}

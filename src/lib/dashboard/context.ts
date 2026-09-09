import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/db/client";
import { requireDashboardContext, resolveOrgId, isAdminRole } from "@/lib/auth/clerk";

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
  const orgId = await resolveOrgId(db, ctx.clerkOrgId);
  return { db, orgId, userId: ctx.userId, isAdmin: isAdminRole(ctx.orgRole) };
}

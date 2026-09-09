import { auth } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Dashboard auth helpers. The active Clerk organization maps to a row in
 * `public.organizations` via `clerk_org_id`.
 */

export interface DashboardContext {
  userId: string;
  clerkOrgId: string;
  orgRole: string | null;
}

/** Require an authenticated user with an active organization, or throw. */
export async function requireDashboardContext(): Promise<DashboardContext> {
  const { userId, orgId, orgRole } = await auth();
  if (!userId) throw new Error("Not authenticated");
  if (!orgId) throw new Error("No active organization selected");
  return { userId, clerkOrgId: orgId, orgRole: orgRole ?? null };
}

/** Resolve the internal organization id for the active Clerk org. */
export async function resolveOrgId(
  db: SupabaseClient,
  clerkOrgId: string,
): Promise<string> {
  const { data, error } = await db
    .from("organizations")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();
  if (error || !data) {
    throw new Error(`Organization not provisioned for Clerk org ${clerkOrgId}`);
  }
  return data.id as string;
}

export function isAdminRole(orgRole: string | null): boolean {
  return orgRole === "admin" || orgRole === "org:admin";
}

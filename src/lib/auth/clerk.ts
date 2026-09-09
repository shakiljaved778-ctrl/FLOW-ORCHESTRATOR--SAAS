import { auth } from "@clerk/nextjs/server";

/**
 * Dashboard auth helpers. The active Clerk organization maps to a row in
 * `public.organizations` via `clerk_org_id`.
 */

export interface DashboardContext {
  userId: string;
  clerkOrgId: string;
  orgRole: string | null;
  orgName: string;
}

/** Require an authenticated user with an active organization, or throw. */
export async function requireDashboardContext(): Promise<DashboardContext> {
  const { userId, orgId, orgRole, orgSlug } = await auth();
  if (!userId) throw new Error("Not authenticated");
  if (!orgId) throw new Error("No active organization selected");
  return {
    userId,
    clerkOrgId: orgId,
    orgRole: orgRole ?? null,
    orgName: orgSlug ?? orgId,
  };
}

export function isAdminRole(orgRole: string | null): boolean {
  return orgRole === "admin" || orgRole === "org:admin";
}

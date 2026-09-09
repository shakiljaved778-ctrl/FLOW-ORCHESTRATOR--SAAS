"use server";

import { revalidatePath } from "next/cache";
import { getDashboardData } from "./context";
import { generateApiKey } from "@/lib/auth/api-key";
import { recordAudit } from "@/lib/audit/audit.service";

/**
 * Server actions for dashboard mutations. Each re-resolves the dashboard
 * context (auth + org) server-side; admin-gated actions check `isAdmin`.
 */

export async function createApiKey(formData: FormData): Promise<{ plaintext: string }> {
  const { db, orgId, userId, isAdmin } = await getDashboardData();
  if (!isAdmin) throw new Error("Admin role required to create API keys.");

  const name = String(formData.get("name") ?? "Untitled key").slice(0, 100);
  const key = generateApiKey("test");

  const { error } = await db.from("api_keys").insert({
    org_id: orgId,
    name,
    key_prefix: key.keyPrefix,
    key_hash: key.keyHash,
    created_by: userId,
  });
  if (error) throw new Error(`Failed to create key: ${error.message}`);

  await recordAudit(db, {
    orgId,
    userId,
    action: "api_key.created",
    resourceType: "api_key",
    responsePayload: { name, prefix: key.keyPrefix },
  });

  revalidatePath("/settings/api-keys");
  // Returned once; the plaintext is never stored or shown again.
  return { plaintext: key.plaintext };
}

export async function revokeApiKey(formData: FormData): Promise<void> {
  const { db, orgId, userId, isAdmin } = await getDashboardData();
  if (!isAdmin) throw new Error("Admin role required to revoke API keys.");

  const id = String(formData.get("id"));
  const { error } = await db
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) throw new Error(`Failed to revoke key: ${error.message}`);

  await recordAudit(db, {
    orgId,
    userId,
    action: "api_key.revoked",
    resourceType: "api_key",
    resourceId: id,
  });
  revalidatePath("/settings/api-keys");
}

export async function updateBranding(formData: FormData): Promise<void> {
  const { db, orgId, userId, isAdmin } = await getDashboardData();
  if (!isAdmin) throw new Error("Admin role required to update branding.");

  const patch: Record<string, string | null> = {
    logo_url: (formData.get("logo_url") as string) || null,
    brand_color: (formData.get("brand_color") as string) || null,
    custom_domain: (formData.get("custom_domain") as string) || null,
  };
  const { error } = await db.from("organizations").update(patch).eq("id", orgId);
  if (error) throw new Error(`Failed to update branding: ${error.message}`);

  await recordAudit(db, {
    orgId,
    userId,
    action: "branding.updated",
    resourceType: "organization",
    resourceId: orgId,
    requestPayload: patch,
  });
  revalidatePath("/settings/branding");
}

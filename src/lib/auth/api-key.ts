import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Scoped API keys for platform integrations. Format: `fo_<env>_<random>`.
 * Only the SHA-256 hash is stored; the plaintext is returned once at creation.
 */

const PREFIX = "fo";

export interface GeneratedKey {
  plaintext: string;
  keyPrefix: string;
  keyHash: string;
}

export function hashKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function generateApiKey(env: "live" | "test" = "test"): GeneratedKey {
  const secret = randomBytes(24).toString("base64url");
  const plaintext = `${PREFIX}_${env}_${secret}`;
  return {
    plaintext,
    keyPrefix: plaintext.slice(0, 12),
    keyHash: hashKey(plaintext),
  };
}

export interface ResolvedKey {
  apiKeyId: string;
  orgId: string;
  scopes: string[];
}

/**
 * Resolve a bearer API key to its organization and scopes, or null if invalid /
 * revoked. Updates last_used_at as a side effect. Uses the service client.
 */
export async function resolveApiKey(
  db: SupabaseClient,
  plaintext: string,
): Promise<ResolvedKey | null> {
  const keyHash = hashKey(plaintext);
  const { data, error } = await db
    .from("api_keys")
    .select("id, org_id, scopes, revoked_at")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (error || !data || data.revoked_at) {
    return null;
  }

  // Best-effort usage timestamp; ignore failures.
  void db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);

  return { apiKeyId: data.id, orgId: data.org_id, scopes: data.scopes ?? [] };
}

export function hasScope(scopes: string[], required: string): boolean {
  return scopes.includes(required);
}

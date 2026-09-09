import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Two Supabase clients:
 *
 *  - `serviceClient()` uses the service-role key. It BYPASSES Row Level Security
 *    and must only be used from trusted server code (API routes, webhook
 *    handlers) that enforces tenancy itself. Never expose it to the browser.
 *
 *  - `anonClient(clerkToken)` uses the anon key with a Clerk-issued JWT, so RLS
 *    scopes every query to the caller's organization. Used for dashboard reads.
 */

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

let _service: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient {
  if (_service) return _service;
  _service = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return _service;
}

export function anonClient(clerkToken?: string): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: clerkToken
        ? { headers: { Authorization: `Bearer ${clerkToken}` } }
        : undefined,
    },
  );
}

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Just-in-time organization provisioning.
 *
 * When a signed-in user with an active Clerk organization first reaches the
 * dashboard, there may be no matching `public.organizations` row yet (Clerk owns
 * identity; the orchestrator's org row is created here on demand). This ensures
 * the row exists AND seeds its chart of accounts, so payments can post a balanced
 * ledger entry immediately.
 *
 * Idempotent: safe to call on every dashboard load. Uses the service-role client.
 */

interface AccountSeed {
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  normal_balance: "debit" | "credit";
}

const CHART_OF_ACCOUNTS: AccountSeed[] = [
  { code: "1000", name: "Cash / PSP Clearing", type: "asset", normal_balance: "debit" },
  { code: "1100", name: "Accounts Receivable", type: "asset", normal_balance: "debit" },
  { code: "2000", name: "Deferred Revenue", type: "liability", normal_balance: "credit" },
  { code: "4000", name: "Revenue", type: "revenue", normal_balance: "credit" },
  { code: "5000", name: "Payment Processing Fees", type: "expense", normal_balance: "debit" },
];

function supportedCurrencies(): string[] {
  const raw = process.env.SUPPORTED_CURRENCIES ?? "QAR,AED,USD";
  return raw
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}

export async function ensureOrgProvisioned(
  db: SupabaseClient,
  clerkOrgId: string,
  orgName: string,
): Promise<string> {
  // Fast path: already provisioned.
  const existing = await db
    .from("organizations")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .maybeSingle();

  let orgId = existing.data?.id as string | undefined;

  if (!orgId) {
    const currencies = supportedCurrencies();
    // Upsert handles the race where two requests provision the same org at once.
    const inserted = await db
      .from("organizations")
      .upsert(
        { clerk_org_id: clerkOrgId, name: orgName, currencies },
        { onConflict: "clerk_org_id" },
      )
      .select("id")
      .single();

    if (inserted.error || !inserted.data) {
      throw new Error(`Failed to provision organization: ${inserted.error?.message}`);
    }
    orgId = inserted.data.id as string;
  }

  // Ensure the chart of accounts exists for every supported currency.
  const rows = supportedCurrencies().flatMap((currency) =>
    CHART_OF_ACCOUNTS.map((a) => ({
      org_id: orgId,
      code: a.code,
      name: a.name,
      type: a.type,
      normal_balance: a.normal_balance,
      currency,
    })),
  );

  const seeded = await db
    .from("accounts")
    .upsert(rows, { onConflict: "org_id,code,currency", ignoreDuplicates: true });

  if (seeded.error) {
    throw new Error(`Failed to seed chart of accounts: ${seeded.error.message}`);
  }

  return orgId;
}

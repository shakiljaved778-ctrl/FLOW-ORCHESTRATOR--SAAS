"use client";

import { createClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client for realtime subscriptions (payments + ledger).
 * Uses the anon key; RLS scopes rows to the caller's org. A Clerk token can be
 * supplied to authorize the socket.
 */
export function browserClient(clerkToken?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anon, {
    auth: { persistSession: false },
    global: clerkToken ? { headers: { Authorization: `Bearer ${clerkToken}` } } : undefined,
    realtime: { params: { eventsPerSecond: 5 } },
  });
}

/**
 * Subscribe to INSERT/UPDATE on a table, invoking `onChange` for each event.
 * Returns an unsubscribe function.
 */
export function subscribeTable(
  client: ReturnType<typeof browserClient>,
  table: "payments" | "journal_entries",
  onChange: (payload: unknown) => void,
): () => void {
  const channel = client
    .channel(`realtime:${table}`)
    .on("postgres_changes", { event: "*", schema: "public", table }, onChange)
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

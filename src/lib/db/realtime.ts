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

export type RealtimeTable = "payments" | "journal_entries" | "settlements";

/**
 * Subscribe to INSERT/UPDATE/DELETE on a table, invoking `onChange` for each
 * event. `onStatus` reports the channel lifecycle ('SUBSCRIBED', 'CHANNEL_ERROR',
 * 'TIMED_OUT', 'CLOSED'). Returns an unsubscribe function.
 */
export function subscribeTable(
  client: ReturnType<typeof browserClient>,
  table: RealtimeTable,
  onChange: (payload: unknown) => void,
  onStatus?: (status: string) => void,
): () => void {
  const channel = client
    .channel(`realtime:${table}`)
    .on("postgres_changes", { event: "*", schema: "public", table }, onChange)
    .subscribe((status) => onStatus?.(status));

  return () => {
    void client.removeChannel(channel);
  };
}

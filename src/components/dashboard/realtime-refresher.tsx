"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { browserClient, subscribeTable, type RealtimeTable } from "@/lib/db/realtime";

/**
 * Subscribes to Postgres changes for `table` and refreshes the server component
 * tree on each event (debounced), so the dashboard reflects new payments /
 * ledger entries without a manual reload.
 *
 * The subscription is a signal only — the actual data is refetched server-side
 * through the org-scoped path, so nothing sensitive flows over the socket. If
 * realtime is not authorized/configured, the page simply doesn't auto-refresh.
 */
export function RealtimeRefresher({ table }: { table: RealtimeTable }) {
  const router = useRouter();
  const { getToken } = useAuth();
  const [status, setStatus] = useState<"connecting" | "live" | "off">("connecting");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    (async () => {
      let token: string | undefined;
      try {
        token = (await getToken()) ?? undefined;
      } catch {
        token = undefined;
      }
      if (cancelled) return;

      const client = browserClient(token);
      // Authorize the realtime socket when a session token is available.
      try {
        if (token) client.realtime.setAuth(token);
      } catch {
        /* best-effort */
      }

      unsubscribe = subscribeTable(
        client,
        table,
        () => {
          if (timer.current) clearTimeout(timer.current);
          // Debounce bursts of events into a single refresh.
          timer.current = setTimeout(() => router.refresh(), 400);
        },
        (s) => {
          if (cancelled) return;
          if (s === "SUBSCRIBED") setStatus("live");
          else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") setStatus("off");
        },
      );
    })();

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      unsubscribe();
    };
  }, [table, getToken, router]);

  const dotColor = status === "live" ? "bg-emerald-500" : status === "off" ? "bg-slate-300" : "bg-amber-400";
  const label = status === "live" ? "Live" : status === "off" ? "Offline" : "Connecting…";

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500" title="Realtime updates">
      <span className={`h-2 w-2 rounded-full ${dotColor} ${status === "live" ? "animate-pulse" : ""}`} />
      {label}
    </span>
  );
}

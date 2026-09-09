import type { SupabaseClient } from "@supabase/supabase-js";
import type { PSP, PaymentStatus } from "@/lib/orchestration/types";
import { recordAudit } from "@/lib/audit/audit.service";
import { sanitize } from "@/lib/audit/sanitize";

/** A PSP webhook, normalized to the orchestrator's common shape. */
export interface NormalizedEvent {
  provider: PSP;
  externalId: string;
  /** Normalized type: 'payment.succeeded' | 'payment.failed' | 'payment.refunded' | other. */
  eventType: string;
  /** The PSP's payment/transaction reference, used to locate the local payment. */
  providerRef?: string;
  raw: Record<string, unknown>;
}

export interface ProcessResult {
  received: true;
  duplicate?: boolean;
  paymentId?: string;
}

const TERMINAL: Record<string, PaymentStatus> = {
  "payment.succeeded": "succeeded",
  "payment.failed": "failed",
  "payment.refunded": "refunded",
};

/**
 * Persist and act on a normalized webhook event:
 *   1. dedupe by (provider, external_id) — redelivered events no-op
 *   2. audit `webhook.received`
 *   3. reflect terminal states onto the referenced payment
 *
 * Uses the service-role client. Signature verification happens in the route
 * before this is called.
 */
export async function processWebhook(
  db: SupabaseClient,
  event: NormalizedEvent,
): Promise<ProcessResult> {
  const { error: insertErr } = await db.from("webhook_events").insert({
    provider: event.provider,
    external_id: event.externalId,
    event_type: event.eventType,
    raw_payload: sanitize(event.raw),
  });

  if (insertErr) {
    if (insertErr.message.includes("duplicate")) {
      return { received: true, duplicate: true };
    }
    throw new Error(`Failed to store webhook event: ${insertErr.message}`);
  }

  await recordAudit(db, {
    action: "webhook.received",
    resourceType: "webhook_event",
    resourceId: event.externalId,
    requestPayload: { provider: event.provider, type: event.eventType },
  });

  const newStatus = TERMINAL[event.eventType];
  if (!newStatus || !event.providerRef) {
    return { received: true };
  }

  // Locate the local payment via its winning attempt's provider reference.
  const { data: attempt } = await db
    .from("payment_attempts")
    .select("payment_id")
    .eq("provider", event.provider)
    .eq("provider_ref", event.providerRef)
    .maybeSingle();

  if (!attempt?.payment_id) {
    return { received: true };
  }

  await db.from("payments").update({ status: newStatus }).eq("id", attempt.payment_id);
  await db
    .from("webhook_events")
    .update({ payment_id: attempt.payment_id, processed_at: new Date().toISOString() })
    .eq("provider", event.provider)
    .eq("external_id", event.externalId);

  return { received: true, paymentId: attempt.payment_id };
}

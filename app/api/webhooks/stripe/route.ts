import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/db/client";
import { getProvider } from "@/lib/providers";
import { recordAudit } from "@/lib/audit/audit.service";
import { sanitize } from "@/lib/audit/sanitize";

export const runtime = "nodejs";

/** Map Stripe event types → the orchestrator's normalized event vocabulary. */
function normalizeType(stripeType: string): string | null {
  switch (stripeType) {
    case "payment_intent.succeeded":
      return "payment.succeeded";
    case "payment_intent.payment_failed":
      return "payment.failed";
    case "charge.refunded":
      return "payment.refunded";
    default:
      return null;
  }
}

/**
 * POST /api/webhooks/stripe
 * Verifies the signature, deduplicates by event id, normalizes into
 * webhook_events, and reflects terminal states onto the payment.
 */
export async function POST(req: NextRequest) {
  const db = serviceClient();
  const signature = req.headers.get("stripe-signature") ?? "";
  const rawBody = await req.text();

  let event: Record<string, unknown>;
  try {
    event = await getProvider("stripe").verifyWebhook(rawBody, signature);
  } catch (e) {
    return NextResponse.json({ error: `Signature verification failed: ${(e as Error).message}` }, { status: 400 });
  }

  const externalId = String(event.id ?? "");
  const stripeType = String(event.type ?? "");
  const normalized = normalizeType(stripeType);

  // Idempotent insert; unique (provider, external_id) rejects redeliveries.
  const { error: insertErr } = await db.from("webhook_events").insert({
    provider: "stripe",
    external_id: externalId,
    event_type: normalized ?? stripeType,
    raw_payload: sanitize(event),
  });
  if (insertErr && !insertErr.message.includes("duplicate")) {
    return NextResponse.json({ error: "Failed to store event" }, { status: 500 });
  }
  if (insertErr) {
    // Already processed — acknowledge so Stripe stops retrying.
    return NextResponse.json({ received: true, duplicate: true });
  }

  await recordAudit(db, {
    action: "webhook.received",
    resourceType: "webhook_event",
    resourceId: externalId,
    requestPayload: { type: stripeType },
  });

  // Reflect refunds onto the payment (success/failure are handled inline at
  // charge time in this MVP's synchronous flow).
  if (normalized === "payment.refunded") {
    const data = (event.data as { object?: Record<string, unknown> } | undefined)?.object;
    const intentId = data?.payment_intent ? String(data.payment_intent) : null;
    if (intentId) {
      const { data: attempt } = await db
        .from("payment_attempts")
        .select("payment_id")
        .eq("provider", "stripe")
        .eq("provider_ref", intentId)
        .maybeSingle();
      if (attempt?.payment_id) {
        await db.from("payments").update({ status: "refunded" }).eq("id", attempt.payment_id);
        await db.from("webhook_events").update({ payment_id: attempt.payment_id, processed_at: new Date().toISOString() }).eq("external_id", externalId).eq("provider", "stripe");
      }
    }
  }

  return NextResponse.json({ received: true });
}

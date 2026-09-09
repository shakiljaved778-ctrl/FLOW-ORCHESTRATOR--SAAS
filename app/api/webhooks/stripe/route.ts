import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/db/client";
import { getProvider } from "@/lib/providers";
import { processWebhook } from "@/lib/webhooks/process";

export const runtime = "nodejs";

/** Map Stripe event types → the orchestrator's normalized vocabulary. */
function normalizeType(stripeType: string): string {
  switch (stripeType) {
    case "payment_intent.succeeded":
      return "payment.succeeded";
    case "payment_intent.payment_failed":
      return "payment.failed";
    case "charge.refunded":
      return "payment.refunded";
    default:
      return stripeType;
  }
}

/**
 * Extract the PaymentIntent id (our attempt's provider_ref) from the event.
 * For payment_intent.* it is the object id; for charge.refunded it is the
 * object's `payment_intent` field.
 */
function extractIntentId(type: string, object: Record<string, unknown>): string | undefined {
  if (type === "charge.refunded") {
    return object.payment_intent ? String(object.payment_intent) : undefined;
  }
  return object.id ? String(object.id) : undefined;
}

/**
 * POST /api/webhooks/stripe
 * Verifies the signature, normalizes, dedupes, and reflects payment state.
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

  const stripeType = String(event.type ?? "");
  const object = ((event.data as { object?: Record<string, unknown> } | undefined)?.object) ?? {};

  try {
    const result = await processWebhook(db, {
      provider: "stripe",
      externalId: String(event.id ?? ""),
      eventType: normalizeType(stripeType),
      providerRef: extractIntentId(stripeType, object),
      raw: event,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

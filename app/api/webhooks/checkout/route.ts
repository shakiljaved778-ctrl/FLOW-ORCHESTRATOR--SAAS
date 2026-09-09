import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/db/client";
import { getProvider } from "@/lib/providers";
import { processWebhook } from "@/lib/webhooks/process";

export const runtime = "nodejs";

/** Map Checkout.com event types → the orchestrator's normalized vocabulary. */
function normalizeType(t: string): string {
  switch (t) {
    case "payment_approved":
    case "payment_captured":
      return "payment.succeeded";
    case "payment_declined":
    case "payment_expired":
    case "payment_canceled":
      return "payment.failed";
    case "payment_refunded":
      return "payment.refunded";
    default:
      return t;
  }
}

/**
 * POST /api/webhooks/checkout
 * Verifies the Cko-Signature, normalizes, dedupes, and reflects payment state.
 */
export async function POST(req: NextRequest) {
  const db = serviceClient();
  const signature = req.headers.get("cko-signature") ?? "";
  const rawBody = await req.text();

  let event: Record<string, unknown>;
  try {
    event = await getProvider("checkout").verifyWebhook(rawBody, signature);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const data = (event.data as Record<string, unknown> | undefined) ?? {};
  const type = String(event.type ?? "");

  try {
    const result = await processWebhook(db, {
      provider: "checkout",
      externalId: String(event.id ?? data.id ?? ""),
      eventType: normalizeType(type),
      // For Checkout.com, the payment id is the reference stored on the attempt.
      providerRef: data.id ? String(data.id) : undefined,
      raw: event,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

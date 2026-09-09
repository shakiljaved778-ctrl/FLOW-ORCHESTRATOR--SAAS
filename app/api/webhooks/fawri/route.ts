import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/db/client";
import { getProvider } from "@/lib/providers";
import { processWebhook } from "@/lib/webhooks/process";

export const runtime = "nodejs";

/** Map Fawri+ partner event types → the orchestrator's normalized vocabulary. */
function normalizeType(t: string): string {
  switch (t.toLowerCase()) {
    case "transfer.completed":
    case "transfer.settled":
      return "payment.succeeded";
    case "transfer.rejected":
    case "transfer.failed":
      return "payment.failed";
    case "transfer.reversed":
      return "payment.refunded";
    default:
      return t;
  }
}

/**
 * POST /api/webhooks/fawri
 * Verifies the x-fawri-signature, normalizes, dedupes, and reflects state.
 */
export async function POST(req: NextRequest) {
  const db = serviceClient();
  const signature = req.headers.get("x-fawri-signature") ?? "";
  const rawBody = await req.text();

  let event: Record<string, unknown>;
  try {
    event = await getProvider("fawri").verifyWebhook(rawBody, signature);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const data = (event.data as Record<string, unknown> | undefined) ?? {};
  const type = String(event.type ?? event.event ?? "");

  try {
    const result = await processWebhook(db, {
      provider: "fawri",
      externalId: String(event.id ?? data.id ?? ""),
      eventType: normalizeType(type),
      providerRef: data.transfer_id ? String(data.transfer_id) : data.id ? String(data.id) : undefined,
      raw: event,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

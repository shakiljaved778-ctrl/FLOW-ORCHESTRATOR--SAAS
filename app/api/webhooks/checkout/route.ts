import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/checkout — Checkout.com webhook handler.
 * STUB: implemented in MVP weeks 3-4 alongside the CheckoutProvider adapter.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Checkout.com webhooks are not enabled yet (planned for weeks 3-4)." },
    { status: 501 },
  );
}

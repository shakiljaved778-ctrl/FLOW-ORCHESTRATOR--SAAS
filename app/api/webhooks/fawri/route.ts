import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/fawri — Fawri+ webhook handler.
 * STUB: implemented in MVP weeks 3-4 alongside the FawriProvider adapter.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Fawri+ webhooks are not enabled yet (planned for weeks 3-4)." },
    { status: 501 },
  );
}

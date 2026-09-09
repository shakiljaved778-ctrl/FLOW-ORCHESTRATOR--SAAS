import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { serviceClient } from "@/lib/db/client";
import { resolveApiKey, hasScope } from "@/lib/auth/api-key";
import { normalizeIdempotencyKey } from "@/lib/orchestration/idempotency";
import { orchestratePayment } from "@/lib/orchestration/orchestrator";
import type { Currency } from "@/lib/orchestration/types";

export const runtime = "nodejs";

const PaymentSchema = z.object({
  amount: z.number().int().positive(), // minor units
  currency: z.enum(["QAR", "AED", "USD"]),
  reference: z.string().max(255).optional(),
  description: z.string().max(1000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

function bearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice("Bearer ".length).trim() || null;
}

/**
 * POST /api/v1/payments
 * Unified payment endpoint for platform integrations. Authenticated by a scoped
 * API key (Bearer). Idempotent via the `Idempotency-Key` header.
 */
export async function POST(req: NextRequest) {
  const db = serviceClient();

  // --- Auth ---
  const token = bearer(req);
  if (!token) {
    return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  }
  const key = await resolveApiKey(db, token);
  if (!key) {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }
  if (!hasScope(key.scopes, "payments:write")) {
    return NextResponse.json({ error: "API key lacks payments:write scope" }, { status: 403 });
  }

  // --- Validate ---
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = PaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  let idempotencyKey: string | undefined;
  try {
    idempotencyKey = normalizeIdempotencyKey(req.headers.get("idempotency-key"));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  // --- Orchestrate ---
  try {
    const result = await orchestratePayment(
      db,
      {
        orgId: key.orgId,
        amount: parsed.data.amount,
        currency: parsed.data.currency as Currency,
        reference: parsed.data.reference,
        description: parsed.data.description,
        idempotencyKey,
        metadata: parsed.data.metadata,
      },
      {
        apiKeyId: key.apiKeyId,
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
        userAgent: req.headers.get("user-agent") ?? undefined,
      },
    );

    const status = result.status === "succeeded" ? 201 : result.status === "failed" ? 402 : 200;
    return NextResponse.json(
      {
        id: result.paymentId,
        status: result.status,
        provider: result.provider,
        idempotent_replay: result.idempotentReplay,
      },
      { status: result.idempotentReplay ? 200 : status },
    );
  } catch (e) {
    // Routing errors (no available provider) → 422; everything else → 500.
    const msg = (e as Error).message;
    const routing = msg.includes("No available provider") || msg.includes("No routing configured");
    return NextResponse.json(
      { error: routing ? msg : "Payment processing error" },
      { status: routing ? 422 : 500 },
    );
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentRequest } from "./types";
import { route } from "./router";
import { executeWithFailover } from "./retry";
import { getProvider } from "@/lib/providers";
import { buildPaymentEntry, findAccountId, postJournalEntry } from "@/lib/ledger/ledger.service";
import { recordAudit } from "@/lib/audit/audit.service";
import { sanitize } from "@/lib/audit/sanitize";

export interface OrchestrateContext {
  apiKeyId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface OrchestrateResult {
  paymentId: string;
  status: string;
  provider?: string;
  idempotentReplay: boolean;
}

/**
 * End-to-end payment orchestration:
 *   1. idempotency check (return existing payment on replay)
 *   2. route → ordered candidate PSPs
 *   3. persist payment (status: routing)
 *   4. execute with failover, persisting every attempt
 *   5. on success, post the balanced ledger entry + usage record
 *   6. audit every step
 *
 * Uses the service-role client; tenancy (org_id) comes from the resolved API key.
 */
export async function orchestratePayment(
  db: SupabaseClient,
  req: PaymentRequest,
  ctx: OrchestrateContext = {},
): Promise<OrchestrateResult> {
  // 1. Idempotency: has this (org, key) already produced a payment?
  if (req.idempotencyKey) {
    const { data: existing } = await db
      .from("payments")
      .select("id, status, routed_provider")
      .eq("org_id", req.orgId)
      .eq("idempotency_key", req.idempotencyKey)
      .maybeSingle();
    if (existing) {
      return {
        paymentId: existing.id,
        status: existing.status,
        provider: existing.routed_provider ?? undefined,
        idempotentReplay: true,
      };
    }
  }

  // 2. Route.
  const decision = route({ currency: req.currency, amount: req.amount });

  // 3. Persist the payment row (status: routing).
  const { data: payment, error: payErr } = await db
    .from("payments")
    .insert({
      org_id: req.orgId,
      amount: req.amount,
      currency: req.currency,
      status: "routing",
      routed_provider: decision.candidates[0],
      reference: req.reference ?? null,
      description: req.description ?? null,
      idempotency_key: req.idempotencyKey ?? null,
      metadata: req.metadata ?? {},
    })
    .select("id")
    .single();

  if (payErr || !payment) {
    throw new Error(`Failed to create payment: ${payErr?.message}`);
  }
  const paymentId = payment.id as string;

  await recordAudit(db, {
    orgId: req.orgId,
    apiKeyId: ctx.apiKeyId,
    action: "payment.created",
    resourceType: "payment",
    resourceId: paymentId,
    requestPayload: req,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  // 4. Execute with failover.
  const exec = await executeWithFailover(
    decision.candidates,
    {
      amount: req.amount,
      currency: req.currency,
      reference: req.reference,
      description: req.description,
      idempotencyKey: req.idempotencyKey,
      metadata: req.metadata,
    },
    getProvider,
  );

  // Persist every attempt for audit + reconciliation.
  if (exec.attempts.length > 0) {
    await db.from("payment_attempts").insert(
      exec.attempts.map((a) => ({
        payment_id: paymentId,
        provider: a.provider,
        attempt_number: a.attemptNumber,
        status: a.result.status,
        provider_ref: a.result.providerRef ?? null,
        provider_response: a.result.providerResponse ? sanitize(a.result.providerResponse) : null,
        error_code: a.result.errorCode ?? null,
        error_message: a.result.errorMessage ?? null,
      })),
    );
  }

  const finalStatus = exec.succeeded ? "succeeded" : "failed";
  const winningProvider = exec.final.provider;

  await db
    .from("payments")
    .update({ status: finalStatus, routed_provider: winningProvider })
    .eq("id", paymentId);

  // 5. On success, post the ledger entry and record billable usage.
  if (exec.succeeded) {
    const [arId, revId] = await Promise.all([
      findAccountId(db, req.orgId, "1100", req.currency), // Accounts Receivable
      findAccountId(db, req.orgId, "4000", req.currency), // Revenue
    ]);

    const entry = buildPaymentEntry({
      orgId: req.orgId,
      amount: req.amount,
      currency: req.currency,
      accountsReceivableId: arId,
      revenueId: revId,
      transactionId: paymentId,
      provider: winningProvider,
      providerResponse: exec.final.providerResponse,
    });
    const { entryId } = await postJournalEntry(db, entry);

    await Promise.all([
      recordAudit(db, {
        orgId: req.orgId,
        apiKeyId: ctx.apiKeyId,
        action: "ledger.entry",
        resourceType: "journal_entry",
        resourceId: entryId,
        responsePayload: { paymentId, provider: winningProvider },
      }),
      db.from("usage_records").insert({
        org_id: req.orgId,
        event_type: "payment.processed",
        quantity: 1,
        metadata: { paymentId, currency: req.currency, amount: req.amount },
      }),
    ]);
  } else {
    await recordAudit(db, {
      orgId: req.orgId,
      apiKeyId: ctx.apiKeyId,
      action: "payment.failed",
      resourceType: "payment",
      resourceId: paymentId,
      responsePayload: { errorCode: exec.final.errorCode, errorMessage: exec.final.errorMessage },
    });
  }

  return {
    paymentId,
    status: finalStatus,
    provider: winningProvider,
    idempotentReplay: false,
  };
}

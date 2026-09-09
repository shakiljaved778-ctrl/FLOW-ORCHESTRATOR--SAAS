/** Core payment-orchestration types shared across the routing engine and PSP adapters. */

export type PSP = "stripe" | "checkout" | "fawri";

export type PaymentStatus =
  | "pending"
  | "routing"
  | "processing"
  | "succeeded"
  | "failed"
  | "refunded";

export type Currency = "QAR" | "AED" | "USD";

/** A payment request as received by POST /api/v1/payments (after validation). */
export interface PaymentRequest {
  orgId: string;
  /** Amount in minor units (integer). */
  amount: number;
  currency: Currency;
  reference?: string;
  description?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

/** The outcome of the routing engine's decision for a request. */
export interface RoutingDecision {
  /** Ordered providers to try: primary first, then failover backups. */
  candidates: PSP[];
  reason: string;
}

/** Normalized result of a single PSP charge attempt. */
export interface ChargeResult {
  provider: PSP;
  success: boolean;
  status: PaymentStatus;
  providerRef?: string;
  /** Raw provider response, to be sanitized before persistence. */
  providerResponse?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
}

/** Arguments passed to a provider adapter to attempt a charge. */
export interface ChargeInput {
  amount: number;
  currency: Currency;
  reference?: string;
  description?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

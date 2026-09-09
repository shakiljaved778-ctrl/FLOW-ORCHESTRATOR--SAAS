import { createHash } from "node:crypto";

/**
 * Idempotency for POST /api/v1/payments.
 *
 * A platform supplies an `Idempotency-Key` header. We persist it on the payment
 * row with a UNIQUE (org_id, idempotency_key) constraint, so a retried request
 * with the same key resolves to the original payment instead of double-charging.
 *
 * `fingerprint` lets us also detect the misuse of reusing a key for a different
 * request body, which should be rejected as a conflict.
 */
export function fingerprintRequest(body: unknown): string {
  const json = JSON.stringify(body, Object.keys(body as object).sort());
  return createHash("sha256").update(json).digest("hex");
}

/** Normalize / validate a client-supplied idempotency key. */
export function normalizeIdempotencyKey(key: string | null | undefined): string | undefined {
  if (!key) return undefined;
  const trimmed = key.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > 255) {
    throw new Error("Idempotency-Key must be at most 255 characters.");
  }
  return trimmed;
}

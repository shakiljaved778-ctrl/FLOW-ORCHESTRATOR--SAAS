/**
 * PCI-safe sanitization. Before any request/response payload or provider
 * response is persisted (audit logs, journal entry snapshots), sensitive fields
 * are redacted so cardholder data and secrets never touch our storage.
 */

const REDACT_KEYS = new Set(
  [
    "card",
    "number",
    "card_number",
    "pan",
    "cvc",
    "cvv",
    "cvv2",
    "expiry",
    "exp_month",
    "exp_year",
    "password",
    "secret",
    "api_key",
    "apikey",
    "authorization",
    "token",
    "client_secret",
  ].map((k) => k.toLowerCase()),
);

const REDACTED = "[REDACTED]";

/** Recursively redact sensitive keys. Returns a new object; input is untouched. */
export function sanitize<T>(value: T, depth = 0): T {
  if (depth > 8 || value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitize(v, depth + 1)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (REDACT_KEYS.has(k.toLowerCase())) {
      out[k] = REDACTED;
    } else {
      out[k] = sanitize(v, depth + 1);
    }
  }
  return out as unknown as T;
}

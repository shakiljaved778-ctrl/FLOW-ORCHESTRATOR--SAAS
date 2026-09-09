import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitize } from "./sanitize";

export interface AuditEvent {
  orgId?: string;
  userId?: string;
  apiKeyId?: string;
  action: string; // 'payment.created', 'ledger.entry', 'webhook.received', ...
  resourceType?: string;
  resourceId?: string;
  requestPayload?: unknown;
  responsePayload?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Append an immutable audit record. Payloads are sanitized (PCI). Writes use the
 * service-role client because audit_logs is admin-read-only under RLS and must
 * be written from every code path regardless of the caller's role.
 *
 * Audit failures must never break the business operation: log and swallow.
 */
export async function recordAudit(db: SupabaseClient, event: AuditEvent): Promise<void> {
  try {
    await db.from("audit_logs").insert({
      org_id: event.orgId ?? null,
      user_id: event.userId ?? null,
      api_key_id: event.apiKeyId ?? null,
      action: event.action,
      resource_type: event.resourceType ?? null,
      resource_id: event.resourceId ?? null,
      request_payload: event.requestPayload ? sanitize(event.requestPayload) : null,
      response_payload: event.responsePayload ? sanitize(event.responsePayload) : null,
      ip_address: event.ipAddress ?? null,
      user_agent: event.userAgent ?? null,
    });
  } catch (err) {
    console.error("[audit] failed to record event", event.action, err);
  }
}

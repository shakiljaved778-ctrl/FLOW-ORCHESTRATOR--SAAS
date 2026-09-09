-- =============================================================================
-- 0004_audit.sql
-- QFC-compliant immutable audit trail. Every API call, payment event, ledger
-- entry, and user action is appended here. Records are append-only and retained
-- for 7 years (enforced operationally; DB blocks mutation/deletion).
-- =============================================================================

create table if not exists public.audit_logs (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid references public.organizations (id) on delete restrict,
  -- Actor.
  user_id        text,                 -- Clerk user id; null for system/API-key events
  api_key_id     uuid references public.api_keys (id),
  -- What happened.
  action         text not null,        -- 'payment.created', 'ledger.entry', 'webhook.received', ...
  resource_type  text,                 -- 'payment' | 'journal_entry' | ...
  resource_id    text,
  -- Sanitized (PCI-safe) request/response snapshots.
  request_payload  jsonb,
  response_payload jsonb,
  -- Request context.
  ip_address     inet,
  user_agent     text,
  -- Timestamps: UTC plus Qatar local time for regulator-facing reports.
  occurred_at    timestamptz not null default now(),
  occurred_at_qatar timestamptz generated always as (occurred_at at time zone 'Asia/Qatar') stored,
  -- 7-year retention marker.
  retain_until   timestamptz not null default (now() + interval '7 years')
);

create index if not exists idx_audit_org_time on public.audit_logs (org_id, occurred_at);
create index if not exists idx_audit_action on public.audit_logs (action);
create index if not exists idx_audit_resource on public.audit_logs (resource_type, resource_id);

-- Append-only: block updates and deletes at the database level.
create or replace function public.block_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Audit logs are immutable and cannot be %', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists trg_audit_immutable on public.audit_logs;
create trigger trg_audit_immutable
  before update or delete on public.audit_logs
  for each row execute function public.block_audit_mutation();

-- =============================================================================
-- 0006_settlements.sql
-- PSP settlement records uploaded for reconciliation. Each row is one line from
-- a provider's settlement report, matched (or not) to a local payment.
-- =============================================================================

create type public.settlement_status as enum ('matched', 'unmatched', 'discrepancy');

create table if not exists public.settlements (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id) on delete cascade,
  provider           public.psp not null,
  provider_ref       text not null,
  amount             bigint not null,          -- minor units
  currency           text not null,
  status             public.settlement_status not null default 'unmatched',
  matched_payment_id uuid references public.payments (id),
  -- Groups the rows from a single uploaded file.
  batch_id           uuid not null,
  uploaded_at        timestamptz not null default now(),
  unique (org_id, provider, provider_ref)
);

create index if not exists idx_settlements_org on public.settlements (org_id, uploaded_at);
create index if not exists idx_settlements_batch on public.settlements (batch_id);
create index if not exists idx_settlements_status on public.settlements (status);

-- RLS: org members may read; writes go through the service role.
alter table public.settlements enable row level security;

create policy settlements_select on public.settlements
  for select using (org_id = public.current_org_id());

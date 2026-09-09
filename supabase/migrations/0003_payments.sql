-- =============================================================================
-- 0003_payments.sql
-- Payment orchestration state: the unified payment record, per-PSP attempts
-- (for retry/failover history), idempotency keys, and normalized webhook events.
-- =============================================================================

create type public.payment_status as enum (
  'pending', 'routing', 'processing', 'succeeded', 'failed', 'refunded'
);

create type public.psp as enum ('stripe', 'checkout', 'fawri');

-- ---------------------------------------------------------------------------
-- payments
-- One row per payment request from a platform. Amount in minor units.
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  amount          bigint not null check (amount > 0),   -- minor units
  currency        text not null,                        -- ISO 4217
  status          public.payment_status not null default 'pending',
  -- Routing outcome.
  routed_provider public.psp,
  -- Platform-supplied reference (e.g. their internal order id).
  reference       text,
  description     text,
  -- Idempotency: unique per org so the same key from two orgs never collides.
  idempotency_key text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, idempotency_key)
);

create index if not exists idx_payments_org_time on public.payments (org_id, created_at);
create index if not exists idx_payments_status on public.payments (status);

drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- payment_attempts
-- Every PSP call for a payment, including failed attempts that triggered
-- failover. Preserves the full routing/retry history for audit + reconciliation.
-- ---------------------------------------------------------------------------
create table if not exists public.payment_attempts (
  id                uuid primary key default gen_random_uuid(),
  payment_id        uuid not null references public.payments (id) on delete cascade,
  provider          public.psp not null,
  attempt_number    integer not null,
  status            public.payment_status not null,
  provider_ref      text,                -- PSP's transaction id
  provider_response jsonb,               -- sanitized
  error_code        text,
  error_message     text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_attempts_payment on public.payment_attempts (payment_id);

-- ---------------------------------------------------------------------------
-- webhook_events
-- Raw + normalized PSP webhook events. Deduplicated by (provider, external_id)
-- so redelivered webhooks are processed once.
-- ---------------------------------------------------------------------------
create table if not exists public.webhook_events (
  id            uuid primary key default gen_random_uuid(),
  provider      public.psp not null,
  external_id   text not null,           -- PSP event id
  event_type    text not null,           -- normalized: 'payment.succeeded', etc.
  payment_id    uuid references public.payments (id),
  raw_payload   jsonb not null,
  processed_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (provider, external_id)
);

create index if not exists idx_webhook_payment on public.webhook_events (payment_id);

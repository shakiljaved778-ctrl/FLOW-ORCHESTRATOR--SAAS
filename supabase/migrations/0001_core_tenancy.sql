-- =============================================================================
-- 0001_core_tenancy.sql
-- Multi-tenant foundation: organizations (mapped to Clerk orgs), scoped API
-- keys, and per-organization usage tracking for billing.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- organizations
-- One row per vertical SaaS platform. `clerk_org_id` is the source of truth
-- for identity; everything else is orchestrator-local configuration.
-- ---------------------------------------------------------------------------
create table if not exists public.organizations (
  id            uuid primary key default gen_random_uuid(),
  clerk_org_id  text not null unique,
  name          text not null,
  -- White-label branding.
  logo_url      text,
  brand_color   text,          -- hex, e.g. '#0f172a'
  custom_domain text,          -- CNAME target for white-label dashboard
  -- Currencies this org is licensed to process (ISO 4217).
  currencies    text[] not null default array['QAR','AED','USD'],
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_organizations_clerk on public.organizations (clerk_org_id);

-- ---------------------------------------------------------------------------
-- api_keys
-- Scoped keys platforms use to call the orchestrator API. Only a hash of the
-- key is stored; the plaintext is shown once at creation time.
-- ---------------------------------------------------------------------------
create table if not exists public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  name         text not null,
  key_prefix   text not null,             -- first chars, shown in UI for identification
  key_hash     text not null unique,      -- sha-256 of the full key
  scopes       text[] not null default array['payments:write','payments:read'],
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  created_by   text                       -- Clerk user id
);

create index if not exists idx_api_keys_org on public.api_keys (org_id);
create index if not exists idx_api_keys_hash on public.api_keys (key_hash);

-- ---------------------------------------------------------------------------
-- usage_records
-- Append-only counter of billable events (one row per processed payment).
-- Aggregated for billing; kept separate from the ledger.
-- ---------------------------------------------------------------------------
create table if not exists public.usage_records (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  event_type text not null,               -- e.g. 'payment.processed'
  quantity   integer not null default 1,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_usage_org_time on public.usage_records (org_id, created_at);

-- updated_at maintenance ------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_organizations_updated_at on public.organizations;
create trigger trg_organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 0005_rls.sql
-- Row Level Security. The dashboard connects with the anon key carrying a
-- Clerk-issued JWT (native Clerk<>Supabase integration) whose claims include
-- `org_id` (the Clerk organization id) and `org_role`.
--
-- Trusted server code (API routes, webhook handlers) uses the service role key
-- which bypasses RLS; those paths enforce tenancy in application code.
--
-- Helper: resolve the caller's internal organization id from the JWT claim.
-- =============================================================================

create or replace function public.current_org_id()
returns uuid
language sql
stable
as $$
  select o.id
    from public.organizations o
   where o.clerk_org_id = (auth.jwt() ->> 'org_id')
   limit 1;
$$;

create or replace function public.is_org_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'org_role', '') in ('admin', 'org:admin');
$$;

-- Enable RLS -----------------------------------------------------------------
alter table public.organizations   enable row level security;
alter table public.api_keys        enable row level security;
alter table public.usage_records   enable row level security;
alter table public.accounts        enable row level security;
alter table public.journal_entries enable row level security;
alter table public.line_items      enable row level security;
alter table public.payments        enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.webhook_events  enable row level security;
alter table public.audit_logs      enable row level security;

-- organizations: members can read their own org; admins can update branding.
create policy org_select on public.organizations
  for select using (id = public.current_org_id());
create policy org_update on public.organizations
  for update using (id = public.current_org_id() and public.is_org_admin());

-- api_keys: admins only, scoped to their org. Never expose key_hash to clients
-- (handled by column selection in the app; RLS controls row visibility).
create policy api_keys_admin on public.api_keys
  for all using (org_id = public.current_org_id() and public.is_org_admin())
  with check (org_id = public.current_org_id() and public.is_org_admin());

-- usage_records: read-only for org members.
create policy usage_select on public.usage_records
  for select using (org_id = public.current_org_id());

-- accounts / payments / attempts: read-only for org members (writes go through
-- the service role in trusted server code).
create policy accounts_select on public.accounts
  for select using (org_id = public.current_org_id());

create policy payments_select on public.payments
  for select using (org_id = public.current_org_id());

create policy attempts_select on public.payment_attempts
  for select using (
    exists (
      select 1 from public.payments p
       where p.id = payment_attempts.payment_id
         and p.org_id = public.current_org_id()
    )
  );

-- journal_entries / line_items: read-only for org members.
create policy journal_select on public.journal_entries
  for select using (org_id = public.current_org_id());

create policy line_items_select on public.line_items
  for select using (
    exists (
      select 1 from public.journal_entries je
       where je.id = line_items.entry_id
         and je.org_id = public.current_org_id()
    )
  );

-- webhook_events: read-only for org members whose payment it references.
create policy webhook_select on public.webhook_events
  for select using (
    payment_id is not null and exists (
      select 1 from public.payments p
       where p.id = webhook_events.payment_id
         and p.org_id = public.current_org_id()
    )
  );

-- audit_logs: only org ADMINS may read (compliance export is admin-gated).
create policy audit_admin_select on public.audit_logs
  for select using (org_id = public.current_org_id() and public.is_org_admin());

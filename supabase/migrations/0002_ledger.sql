-- =============================================================================
-- 0002_ledger.sql
-- Unified double-entry ledger. Amounts are stored as BIGINT in the currency's
-- minor unit (e.g. dirhams, halalas) — never floats. Every journal entry must
-- balance: sum(debits) = sum(credits).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- accounts
-- Chart of accounts, scoped per organization. `normal_balance` records whether
-- the account increases on the debit or credit side.
-- ---------------------------------------------------------------------------
create type public.account_type as enum ('asset','liability','equity','revenue','expense');
create type public.normal_balance as enum ('debit','credit');

create table if not exists public.accounts (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  code           text not null,          -- e.g. '1100' Accounts Receivable
  name           text not null,          -- e.g. 'Accounts Receivable'
  type           public.account_type not null,
  normal_balance public.normal_balance not null,
  currency       text not null,          -- ISO 4217
  created_at     timestamptz not null default now(),
  unique (org_id, code, currency)
);

create index if not exists idx_accounts_org on public.accounts (org_id);

-- ---------------------------------------------------------------------------
-- journal_entries
-- The atomic, immutable unit of the ledger. One entry groups the balanced set
-- of line items for a single business event (a payment, a refund, etc.).
-- QFC audit metadata is captured inline and is never mutated after insert.
-- ---------------------------------------------------------------------------
create table if not exists public.journal_entries (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  entry_date       timestamptz not null default now(),
  description      text not null,
  -- Links back to the originating payment / event for reconciliation.
  transaction_id   uuid,
  -- QFC immutable audit metadata.
  user_id          text,                 -- Clerk user id, null for system events
  provider         text,                 -- 'stripe' | 'checkout' | 'fawri'
  provider_response jsonb,               -- sanitized PSP response snapshot
  created_at       timestamptz not null default now()
);

create index if not exists idx_journal_org_date on public.journal_entries (org_id, entry_date);
create index if not exists idx_journal_txn on public.journal_entries (transaction_id);

-- ---------------------------------------------------------------------------
-- line_items
-- Individual debit/credit legs of a journal entry. Exactly one of
-- (debit, credit) is non-zero per row.
-- ---------------------------------------------------------------------------
create table if not exists public.line_items (
  id         uuid primary key default gen_random_uuid(),
  entry_id   uuid not null references public.journal_entries (id) on delete cascade,
  account_id uuid not null references public.accounts (id),
  -- Minor units. Exactly one side is > 0.
  debit      bigint not null default 0 check (debit  >= 0),
  credit     bigint not null default 0 check (credit >= 0),
  currency   text not null,
  memo       text,
  constraint chk_one_sided check (
    (debit > 0 and credit = 0) or (credit > 0 and debit = 0)
  )
);

create index if not exists idx_line_items_entry on public.line_items (entry_id);
create index if not exists idx_line_items_account on public.line_items (account_id);

-- ---------------------------------------------------------------------------
-- Double-entry balance enforcement.
-- On any change to a journal entry's line items, assert debits == credits.
-- Runs as a constraint trigger deferred to statement end so multi-row inserts
-- (the two legs) are validated together, not row-by-row.
-- ---------------------------------------------------------------------------
create or replace function public.assert_entry_balanced()
returns trigger
language plpgsql
as $$
declare
  affected_entry uuid := coalesce(new.entry_id, old.entry_id);
  total_debit    bigint;
  total_credit   bigint;
begin
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
    into total_debit, total_credit
    from public.line_items
   where entry_id = affected_entry;

  if total_debit <> total_credit then
    raise exception
      'Unbalanced journal entry %: debits=% credits=%',
      affected_entry, total_debit, total_credit
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

drop trigger if exists trg_line_items_balanced on public.line_items;
create constraint trigger trg_line_items_balanced
  after insert or update or delete on public.line_items
  deferrable initially deferred
  for each row execute function public.assert_entry_balanced();

-- ---------------------------------------------------------------------------
-- Immutability: journal entries and line items are append-only.
-- Block UPDATE / DELETE on posted entries at the database level.
-- ---------------------------------------------------------------------------
create or replace function public.block_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Ledger records are immutable (append-only) and cannot be % ', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists trg_journal_immutable on public.journal_entries;
create trigger trg_journal_immutable
  before update or delete on public.journal_entries
  for each row execute function public.block_ledger_mutation();

drop trigger if exists trg_line_items_immutable on public.line_items;
create trigger trg_line_items_immutable
  before update or delete on public.line_items
  for each row execute function public.block_ledger_mutation();

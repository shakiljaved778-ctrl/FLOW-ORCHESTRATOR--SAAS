-- =============================================================================
-- seed.sql
-- Development seed: one demo organization and a minimal chart of accounts per
-- supported currency. Safe to run repeatedly (idempotent upserts).
-- =============================================================================

insert into public.organizations (clerk_org_id, name, brand_color, currencies)
values ('org_demo_seed', 'Demo Vertical SaaS', '#0f172a', array['QAR','AED','USD'])
on conflict (clerk_org_id) do nothing;

-- Standard chart of accounts, replicated per currency.
do $$
declare
  demo_org uuid;
  cur      text;
begin
  select id into demo_org from public.organizations where clerk_org_id = 'org_demo_seed';

  foreach cur in array array['QAR','AED','USD'] loop
    insert into public.accounts (org_id, code, name, type, normal_balance, currency) values
      (demo_org, '1000', 'Cash / PSP Clearing',   'asset',     'debit',  cur),
      (demo_org, '1100', 'Accounts Receivable',    'asset',     'debit',  cur),
      (demo_org, '2000', 'Deferred Revenue',       'liability', 'credit', cur),
      (demo_org, '4000', 'Revenue',                'revenue',   'credit', cur),
      (demo_org, '5000', 'Payment Processing Fees','expense',   'debit',  cur)
    on conflict (org_id, code, currency) do nothing;
  end loop;
end $$;

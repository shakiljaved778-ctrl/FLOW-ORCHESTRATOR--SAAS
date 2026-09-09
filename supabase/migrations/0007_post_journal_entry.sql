-- =============================================================================
-- 0007_post_journal_entry.sql
-- Transactional ledger posting. Inserts a journal entry header and all of its
-- line items in ONE function call (one transaction). The deferred balance
-- constraint is forced to check before the function returns, so an unbalanced
-- or malformed entry rolls back atomically instead of leaving a header with no
-- (or partial) legs.
--
-- Called only by trusted server code via the service role.
-- =============================================================================

create or replace function public.post_journal_entry(
  p_org_id            uuid,
  p_description       text,
  p_lines             jsonb,
  p_transaction_id    uuid   default null,
  p_user_id           text   default null,
  p_provider          text   default null,
  p_provider_response jsonb  default null
)
returns uuid
language plpgsql
as $$
declare
  v_entry_id     uuid;
  v_total_debit  bigint := 0;
  v_total_credit bigint := 0;
  v_line         jsonb;
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'A journal entry requires an array of at least two line items'
      using errcode = 'check_violation';
  end if;

  -- Fast in-function balance pre-check (the deferred trigger is the authority).
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_total_debit  := v_total_debit  + coalesce((v_line->>'debit')::bigint, 0);
    v_total_credit := v_total_credit + coalesce((v_line->>'credit')::bigint, 0);
  end loop;

  if v_total_debit <> v_total_credit then
    raise exception 'Unbalanced journal entry: debits=% credits=%', v_total_debit, v_total_credit
      using errcode = 'check_violation';
  end if;

  insert into public.journal_entries
    (org_id, description, transaction_id, user_id, provider, provider_response)
  values
    (p_org_id, p_description, p_transaction_id, p_user_id, p_provider, p_provider_response)
  returning id into v_entry_id;

  insert into public.line_items (entry_id, account_id, debit, credit, currency, memo)
  select
    v_entry_id,
    (l->>'account_id')::uuid,
    coalesce((l->>'debit')::bigint, 0),
    coalesce((l->>'credit')::bigint, 0),
    l->>'currency',
    l->>'memo'
  from jsonb_array_elements(p_lines) as l;

  -- Force the deferred balance constraint (and any other deferred checks) to run
  -- NOW, so a violation aborts this function/transaction rather than surfacing
  -- only at the outer commit.
  set constraints all immediate;

  return v_entry_id;
end;
$$;

-- Trusted server code only.
revoke all on function public.post_journal_entry(uuid, text, jsonb, uuid, text, jsonb, jsonb) from public;
grant execute on function public.post_journal_entry(uuid, text, jsonb, uuid, text, jsonb, jsonb) to service_role;

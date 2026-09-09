-- =============================================================================
-- 0008_realtime.sql
-- Add the dashboard's live tables to the Supabase realtime publication so
-- Postgres change events are emitted for them. Guarded so it is safe to run
-- repeatedly and whether or not the publication already exists.
-- =============================================================================

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array['payments', 'journal_entries', 'settlements'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

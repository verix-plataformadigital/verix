-- VÉRIX — Supabase read-only audit pack
-- Date prepared: 2026-10-22
-- Purpose: repeat schema, privilege, RLS, migration, cron, and storage diagnostics.
-- Safety: all statements below are SELECTs. Do NOT add DDL/DML to this file.
-- Run sections individually from an authorized SQL editor. Do not export plate values,
-- tokens, raw ASF responses, or other operational payloads into the report.

-- 1. Effective database and installed migration ledger.
select current_database() as database_name,
       current_setting('server_version') as postgres_version,
       now() at time zone 'utc' as observed_at_utc;

select version, name
from supabase_migrations.schema_migrations
order by version;

-- 2. Public tables, estimated rows, RLS flags, and table/index/total size.
select
  ns.nspname as schema_name,
  cl.relname as table_name,
  greatest(cl.reltuples::bigint, 0) as estimated_rows,
  cl.relrowsecurity as rls_enabled,
  cl.relforcerowsecurity as rls_forced,
  pg_size_pretty(pg_relation_size(cl.oid)) as table_size,
  pg_size_pretty(pg_indexes_size(cl.oid)) as indexes_size,
  pg_size_pretty(pg_total_relation_size(cl.oid)) as total_size
from pg_class cl
join pg_namespace ns on ns.oid = cl.relnamespace
where ns.nspname = 'public'
  and cl.relkind in ('r','p')
order by pg_total_relation_size(cl.oid) desc, cl.relname;

-- 3. Public schema columns and defaults for a reproducible structural inventory.
select
  table_schema, table_name, ordinal_position, column_name,
  data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- 4. RLS policies: verify client roles do not have unintended direct access.
select
  schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 5. Triggers that update operational presence or telemetry data.
select
  event_object_schema, event_object_table, trigger_name,
  action_timing, event_manipulation, action_orientation, action_statement
from information_schema.triggers
where event_object_schema = 'public'
order by event_object_table, trigger_name, event_manipulation;

-- 6. Functions, arguments, SECURITY DEFINER, pinned settings, and ACL.
select
  ns.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_result(p.oid) as return_type,
  p.prosecdef as security_definer,
  coalesce(array_to_string(p.proconfig, '; '), '') as function_settings,
  coalesce(array_to_string(p.proacl, ', '), 'default ACL') as function_acl
from pg_proc p
join pg_namespace ns on ns.oid = p.pronamespace
where ns.nspname = 'public'
order by p.proname, identity_arguments;

-- 7. Explicit routine privileges including PUBLIC EXECUTE.
select
  specific_schema, routine_name, grantee, privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and grantee in ('PUBLIC','anon','authenticated','service_role','postgres')
order by routine_name, grantee, privilege_type;

-- 8. Index definitions and cumulative usage counters.
-- Never drop an index based on idx_scan alone; inspect query plans and write cost first.
select
  s.schemaname, s.relname as table_name, s.indexrelname as index_name,
  s.idx_scan, s.idx_tup_read, s.idx_tup_fetch,
  pg_size_pretty(pg_relation_size(s.indexrelid)) as index_size,
  i.indexdef
from pg_stat_user_indexes s
join pg_indexes i
  on i.schemaname = s.schemaname
 and i.tablename = s.relname
 and i.indexname = s.indexrelname
where s.schemaname = 'public'
order by pg_relation_size(s.indexrelid) desc, s.relname, s.indexrelname;

-- 9. Table-level reads and write churn (counter resets/restarts affect interpretation).
select
  schemaname, relname as table_name,
  seq_scan, seq_tup_read, idx_scan, idx_tup_fetch,
  n_tup_ins, n_tup_upd, n_tup_del, n_live_tup, n_dead_tup,
  last_vacuum, last_autovacuum, last_analyze, last_autoanalyze
from pg_stat_user_tables
where schemaname = 'public'
order by n_dead_tup desc, seq_tup_read desc;

-- 10. pg_cron jobs and the most recent five executions per job.
select
  j.jobid, j.jobname, j.schedule, j.active, j.command,
  d.runid, d.status, d.return_message, d.start_time, d.end_time,
  extract(epoch from (d.end_time - d.start_time)) as duration_seconds
from cron.job j
left join lateral (
  select runid, status, return_message, start_time, end_time
  from cron.job_run_details
  where jobid = j.jobid
  order by start_time desc
  limit 5
) d on true
order by j.jobid, d.start_time desc;

-- 11. Current operational/legacy tables worth checking in this project.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  pg_size_pretty(pg_total_relation_size(c.oid)) as total_size
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r','p')
  and (
    c.relname like 'verix2_%'
    or c.relname in ('events','sessions','installations','verix_insurance_no_cases')
  )
order by c.relname;

-- 12. Reconciliation reminder:
-- compare the migration ledger by exact version, then normalized name, and finally
-- SQL content / effective schema. Do not reset schema_migrations, rename applied files,
-- or replay old migrations in production to make counts line up.

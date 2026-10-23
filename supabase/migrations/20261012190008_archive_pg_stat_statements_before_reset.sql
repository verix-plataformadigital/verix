-- Preserve a private snapshot of PostgreSQL query-performance counters.
-- This table stores database performance metadata, not VERIX operational events.
CREATE SCHEMA IF NOT EXISTS verix_internal;
REVOKE ALL ON SCHEMA verix_internal FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS verix_internal.pg_stat_statements_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  snapshot_id uuid NOT NULL DEFAULT gen_random_uuid(),
  snapshot_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  stats_reset_at timestamptz,
  database_name text NOT NULL,
  database_oid oid NOT NULL,
  user_oid oid NOT NULL,
  queryid bigint NOT NULL,
  query_text text NOT NULL,
  plans bigint NOT NULL DEFAULT 0,
  calls bigint NOT NULL DEFAULT 0,
  total_plan_time double precision NOT NULL DEFAULT 0,
  total_exec_time double precision NOT NULL DEFAULT 0,
  mean_exec_time double precision NOT NULL DEFAULT 0,
  rows bigint NOT NULL DEFAULT 0,
  shared_blks_hit bigint NOT NULL DEFAULT 0,
  shared_blks_read bigint NOT NULL DEFAULT 0,
  shared_blks_dirtied bigint NOT NULL DEFAULT 0,
  shared_blks_written bigint NOT NULL DEFAULT 0,
  local_blks_hit bigint NOT NULL DEFAULT 0,
  local_blks_read bigint NOT NULL DEFAULT 0,
  local_blks_dirtied bigint NOT NULL DEFAULT 0,
  local_blks_written bigint NOT NULL DEFAULT 0,
  temp_blks_read bigint NOT NULL DEFAULT 0,
  temp_blks_written bigint NOT NULL DEFAULT 0,
  blk_read_time double precision NOT NULL DEFAULT 0,
  blk_write_time double precision NOT NULL DEFAULT 0
);

ALTER TABLE verix_internal.pg_stat_statements_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE verix_internal.pg_stat_statements_history FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE verix_internal.pg_stat_statements_history_id_seq FROM PUBLIC, anon, authenticated, service_role;

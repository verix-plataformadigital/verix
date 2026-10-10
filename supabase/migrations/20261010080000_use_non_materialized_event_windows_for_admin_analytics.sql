-- Allow PostgreSQL to push event/time filters into the underlying table scans
-- instead of materializing large, wide 30-day event windows to temporary disk.
-- This reduces repeated temporary I/O in verix2_admin_analytics while keeping
-- the original result shape and event definitions unchanged.
DO $migration$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.verix2_admin_analytics(timestamp with time zone)'::regprocedure)
    INTO v_definition;

  IF position('ev AS (' IN v_definition)=0
     OR position('ev_total AS (' IN v_definition)=0
     OR position('ev AS NOT MATERIALIZED (' IN v_definition)>0
     OR position('ev_total AS NOT MATERIALIZED (' IN v_definition)>0 THEN
    RAISE EXCEPTION 'Unexpected analytics CTE definition; refusing to change function';
  END IF;

  v_definition := replace(v_definition, 'ev AS (', 'ev AS NOT MATERIALIZED (');
  v_definition := replace(v_definition, 'ev_total AS (', 'ev_total AS NOT MATERIALIZED (');

  IF position('ev AS NOT MATERIALIZED (' IN v_definition)=0
     OR position('ev_total AS NOT MATERIALIZED (' IN v_definition)=0
     OR position('ev AS (' IN v_definition)>0
     OR position('ev_total AS (' IN v_definition)>0 THEN
    RAISE EXCEPTION 'CTE optimization validation failed; no changes applied';
  END IF;

  EXECUTE v_definition;
END
$migration$;

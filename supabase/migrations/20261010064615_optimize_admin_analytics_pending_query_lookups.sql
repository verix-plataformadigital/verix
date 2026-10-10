-- Avoid repeated full scans of the materialized event windows when
-- determining whether an insurance query is pending. Build each pending
-- query-id set once and join it into the query-quality CTEs.
DO $migration$
DECLARE
  v_definition text;
  v_old_pending text := regexp_replace($old_pending$
WHEN EXISTS (
             SELECT 1 FROM ev pe
             WHERE pe.query_id=q.query_id AND pe.event='vehicle_insurance_pending'
           ) THEN 'pending'
$old_pending$, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_new_pending text := regexp_replace($new_pending$
WHEN pq.query_id IS NOT NULL THEN 'pending'
$new_pending$, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_old_pending_total text := regexp_replace($old_pending_total$
WHEN EXISTS (SELECT 1 FROM ev_total pe WHERE pe.query_id=qt.query_id AND pe.event='vehicle_insurance_pending') THEN 'pending'
$old_pending_total$, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_new_pending_total text := regexp_replace($new_pending_total$
WHEN pqt.query_id IS NOT NULL THEN 'pending'
$new_pending_total$, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_old_join text := $old_join$  LEFT JOIN final_counts fc ON fc.query_id=q.query_id
),
q_total AS ($old_join$;
  v_new_join text := $new_join$  LEFT JOIN final_counts fc ON fc.query_id=q.query_id
  LEFT JOIN pending_queries pq ON pq.query_id=q.query_id
),
q_total AS ($new_join$;
  v_old_join_total text := $old_join_total$  FROM q_total qt LEFT JOIN final_counts_total fc ON fc.query_id=qt.query_id
),
overview AS ($old_join_total$;
  v_new_join_total text := $new_join_total$  FROM q_total qt
  LEFT JOIN final_counts_total fc ON fc.query_id=qt.query_id
  LEFT JOIN pending_queries_total pqt ON pqt.query_id=qt.query_id
),
overview AS ($new_join_total$;
BEGIN
  SELECT pg_get_functiondef('public.verix2_admin_analytics(timestamp with time zone)'::regprocedure)
    INTO v_definition;

  IF position('query_quality AS (' IN v_definition)=0
     OR position('query_quality_total AS (' IN v_definition)=0
     OR position(v_old_pending IN v_definition)=0
     OR position(v_old_pending_total IN v_definition)=0
     OR position(v_old_join IN v_definition)=0
     OR position(v_old_join_total IN v_definition)=0 THEN
    RAISE EXCEPTION 'Analytics definition differs from the expected version; no changes applied';
  END IF;

  v_definition := replace(v_definition,
    'query_quality AS (',
    $insert_pending$
pending_queries AS (
  SELECT DISTINCT query_id FROM ev
  WHERE event='vehicle_insurance_pending' AND query_id IS NOT NULL
),
query_quality AS (
$insert_pending$);

  v_definition := replace(v_definition,
    'query_quality_total AS (',
    $insert_pending_total$
pending_queries_total AS (
  SELECT DISTINCT query_id FROM ev_total
  WHERE event='vehicle_insurance_pending' AND query_id IS NOT NULL
),
query_quality_total AS (
$insert_pending_total$);

  v_definition := replace(v_definition, v_old_pending, v_new_pending);
  v_definition := replace(v_definition, v_old_pending_total, v_new_pending_total);
  v_definition := replace(v_definition, v_old_join, v_new_join);
  v_definition := replace(v_definition, v_old_join_total, v_new_join_total);

  IF position(v_old_pending IN v_definition)>0
     OR position(v_old_pending_total IN v_definition)>0
     OR position('LEFT JOIN pending_queries pq ON pq.query_id=q.query_id' IN v_definition)=0
     OR position('LEFT JOIN pending_queries_total pqt ON pqt.query_id=qt.query_id' IN v_definition)=0 THEN
    RAISE EXCEPTION 'Analytics optimization validation failed; no changes applied';
  END IF;

  EXECUTE v_definition;
END
$migration$;

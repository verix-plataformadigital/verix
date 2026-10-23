-- Fast incremental reconciliation of insurance counters between cached snapshots.
-- The function compares query classifications at p_since and p_now; it never edits telemetry.
CREATE OR REPLACE FUNCTION public.verix2_admin_insurance_delta_v1(p_since timestamp with time zone, p_now timestamp with time zone, p_today_start timestamp with time zone, p_week_start timestamp with time zone, p_total_start timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
 SET work_mem TO '16MB'
AS $function$
WITH bounds AS (
  SELECT
    coalesce(p_since, coalesce(p_now, clock_timestamp()) - interval '6 minutes') AS cutoff,
    coalesce(p_now, clock_timestamp()) AS now_at,
    coalesce(
      p_today_start,
      date_trunc('day', coalesce(p_now, clock_timestamp()) AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'Europe/Lisbon'
    ) AS today_start,
    coalesce(p_week_start, coalesce(p_now, clock_timestamp()) - interval '7 days') AS week_start,
    coalesce(p_total_start, coalesce(p_now, clock_timestamp()) - interval '365 days') AS total_start
),
periods AS (
  SELECT 'today'::text AS period, today_start AS start_at, now_at AS end_at FROM bounds
  UNION ALL
  SELECT 'week', week_start, now_at FROM bounds
  UNION ALL
  SELECT 'total', total_start, now_at FROM bounds
),
earliest_period AS (
  SELECT least(today_start, week_start, total_start) AS start_at FROM bounds
),
candidate_ids AS MATERIALIZED (
  SELECT DISTINCT e.query_id
  FROM public.verix2_events e
  CROSS JOIN bounds b
  WHERE e.query_id IS NOT NULL
    AND e.event IN (
      'vehicle_lookup', 'vehicle_insurance_pending',
      'vehicle_insurance_yes', 'vehicle_insurance_no', 'vehicle_insurance_error'
    )
    AND e.occurred_at >= b.cutoff
    AND e.occurred_at < b.now_at
),
event_scope AS MATERIALIZED (
  SELECT e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  JOIN candidate_ids c ON c.query_id = e.query_id
  CROSS JOIN bounds b
  CROSS JOIN earliest_period ep
  WHERE e.occurred_at >= ep.start_at
    AND e.occurred_at < b.now_at
    AND e.event IN (
      'vehicle_lookup', 'vehicle_insurance_pending',
      'vehicle_insurance_yes', 'vehicle_insurance_no', 'vehicle_insurance_error'
    )
),
start_before AS (
  SELECT e.query_id, min(e.occurred_at) AS started_at
  FROM event_scope e
  CROSS JOIN bounds b
  WHERE e.event = 'vehicle_lookup'
    AND e.occurred_at < b.cutoff
  GROUP BY e.query_id
),
finals_before AS (
  SELECT e.query_id,
    count(*)::bigint AS final_count,
    count(DISTINCT e.event)::bigint AS final_type_count,
    min(e.event) AS single_final_event
  FROM event_scope e
  JOIN start_before s ON s.query_id = e.query_id
  CROSS JOIN bounds b
  WHERE e.event IN ('vehicle_insurance_yes', 'vehicle_insurance_no', 'vehicle_insurance_error')
    AND e.occurred_at >= s.started_at
    AND e.occurred_at < b.cutoff
  GROUP BY e.query_id
),
pending_before AS (
  SELECT e.query_id, max(e.occurred_at) AS pending_at
  FROM event_scope e
  JOIN start_before s ON s.query_id = e.query_id
  CROSS JOIN bounds b
  WHERE e.event = 'vehicle_insurance_pending'
    AND e.occurred_at >= s.started_at
    AND e.occurred_at < b.cutoff
  GROUP BY e.query_id
),
state_before AS (
  SELECT
    s.query_id,
    s.started_at,
    CASE
      WHEN coalesce(f.final_count, 0) = 1 THEN 'valid'
      WHEN coalesce(f.final_count, 0) > 1 AND coalesce(f.final_type_count, 0) > 1 THEN 'contradictory'
      WHEN coalesce(f.final_count, 0) > 1 THEN 'duplicate_finals'
      WHEN p.pending_at >= b.cutoff - interval '10 minutes' THEN 'pending'
      ELSE 'incomplete'
    END AS outcome_state,
    CASE WHEN f.final_count = 1 THEN f.single_final_event ELSE NULL END AS final_event
  FROM start_before s
  CROSS JOIN bounds b
  LEFT JOIN finals_before f ON f.query_id = s.query_id
  LEFT JOIN pending_before p ON p.query_id = s.query_id
),
start_now AS (
  SELECT e.query_id, min(e.occurred_at) AS started_at
  FROM event_scope e
  WHERE e.event = 'vehicle_lookup'
  GROUP BY e.query_id
),
finals_now AS (
  SELECT e.query_id,
    count(*)::bigint AS final_count,
    count(DISTINCT e.event)::bigint AS final_type_count,
    min(e.event) AS single_final_event
  FROM event_scope e
  JOIN start_now s ON s.query_id = e.query_id
  WHERE e.event IN ('vehicle_insurance_yes', 'vehicle_insurance_no', 'vehicle_insurance_error')
    AND e.occurred_at >= s.started_at
  GROUP BY e.query_id
),
pending_now AS (
  SELECT e.query_id, max(e.occurred_at) AS pending_at
  FROM event_scope e
  JOIN start_now s ON s.query_id = e.query_id
  WHERE e.event = 'vehicle_insurance_pending'
    AND e.occurred_at >= s.started_at
  GROUP BY e.query_id
),
state_now AS (
  SELECT
    s.query_id,
    s.started_at,
    CASE
      WHEN coalesce(f.final_count, 0) = 1 THEN 'valid'
      WHEN coalesce(f.final_count, 0) > 1 AND coalesce(f.final_type_count, 0) > 1 THEN 'contradictory'
      WHEN coalesce(f.final_count, 0) > 1 THEN 'duplicate_finals'
      WHEN p.pending_at >= b.now_at - interval '10 minutes' THEN 'pending'
      ELSE 'incomplete'
    END AS outcome_state,
    CASE WHEN f.final_count = 1 THEN f.single_final_event ELSE NULL END AS final_event
  FROM start_now s
  CROSS JOIN bounds b
  LEFT JOIN finals_now f ON f.query_id = s.query_id
  LEFT JOIN pending_now p ON p.query_id = s.query_id
),
query_deltas AS (
  SELECT
    p.period,
    coalesce(sum(
      (CASE WHEN n.started_at >= p.start_at AND n.started_at < p.end_at THEN 1 ELSE 0 END) -
      (CASE WHEN old.started_at >= p.start_at AND old.started_at < p.end_at THEN 1 ELSE 0 END)
    ), 0)::bigint AS consultations,
    coalesce(sum(
      (CASE WHEN n.started_at >= p.start_at AND n.started_at < p.end_at AND n.outcome_state = 'valid' THEN 1 ELSE 0 END) -
      (CASE WHEN old.started_at >= p.start_at AND old.started_at < p.end_at AND old.outcome_state = 'valid' THEN 1 ELSE 0 END)
    ), 0)::bigint AS finals,
    coalesce(sum(
      (CASE WHEN n.started_at >= p.start_at AND n.started_at < p.end_at AND n.outcome_state = 'valid' AND n.final_event = 'vehicle_insurance_yes' THEN 1 ELSE 0 END) -
      (CASE WHEN old.started_at >= p.start_at AND old.started_at < p.end_at AND old.outcome_state = 'valid' AND old.final_event = 'vehicle_insurance_yes' THEN 1 ELSE 0 END)
    ), 0)::bigint AS insured,
    coalesce(sum(
      (CASE WHEN n.started_at >= p.start_at AND n.started_at < p.end_at AND n.outcome_state = 'valid' AND n.final_event = 'vehicle_insurance_no' THEN 1 ELSE 0 END) -
      (CASE WHEN old.started_at >= p.start_at AND old.started_at < p.end_at AND old.outcome_state = 'valid' AND old.final_event = 'vehicle_insurance_no' THEN 1 ELSE 0 END)
    ), 0)::bigint AS uninsured,
    coalesce(sum(
      (CASE WHEN n.started_at >= p.start_at AND n.started_at < p.end_at AND n.outcome_state = 'valid' AND n.final_event = 'vehicle_insurance_error' THEN 1 ELSE 0 END) -
      (CASE WHEN old.started_at >= p.start_at AND old.started_at < p.end_at AND old.outcome_state = 'valid' AND old.final_event = 'vehicle_insurance_error' THEN 1 ELSE 0 END)
    ), 0)::bigint AS errors,
    coalesce(sum(
      (CASE WHEN n.started_at >= p.start_at AND n.started_at < p.end_at AND n.outcome_state = 'pending' THEN 1 ELSE 0 END) -
      (CASE WHEN old.started_at >= p.start_at AND old.started_at < p.end_at AND old.outcome_state = 'pending' THEN 1 ELSE 0 END)
    ), 0)::bigint AS pending,
    coalesce(sum(
      (CASE WHEN n.started_at >= p.start_at AND n.started_at < p.end_at AND n.outcome_state = 'incomplete' THEN 1 ELSE 0 END) -
      (CASE WHEN old.started_at >= p.start_at AND old.started_at < p.end_at AND old.outcome_state = 'incomplete' THEN 1 ELSE 0 END)
    ), 0)::bigint AS incomplete,
    coalesce(sum(
      (CASE WHEN n.started_at >= p.start_at AND n.started_at < p.end_at AND n.outcome_state = 'contradictory' THEN 1 ELSE 0 END) -
      (CASE WHEN old.started_at >= p.start_at AND old.started_at < p.end_at AND old.outcome_state = 'contradictory' THEN 1 ELSE 0 END)
    ), 0)::bigint AS contradictory,
    coalesce(sum(
      (CASE WHEN n.started_at >= p.start_at AND n.started_at < p.end_at AND n.outcome_state = 'duplicate_finals' THEN 1 ELSE 0 END) -
      (CASE WHEN old.started_at >= p.start_at AND old.started_at < p.end_at AND old.outcome_state = 'duplicate_finals' THEN 1 ELSE 0 END)
    ), 0)::bigint AS duplicate_finals
  FROM periods p
  CROSS JOIN state_now n
  LEFT JOIN state_before old ON old.query_id = n.query_id
  GROUP BY p.period
),
raw_error_deltas AS (
  SELECT p.period, count(e.event_id)::bigint AS error_events
  FROM periods p
  CROSS JOIN bounds b
  LEFT JOIN public.verix2_events e
    ON e.event = 'vehicle_insurance_error'
   AND e.occurred_at >= b.cutoff
   AND e.occurred_at < b.now_at
   AND e.occurred_at >= p.start_at
   AND e.occurred_at < p.end_at
  GROUP BY p.period
),
period_results AS (
  SELECT
    p.period,
    coalesce(q.consultations, 0)::bigint AS consultations,
    coalesce(q.finals, 0)::bigint AS finals,
    coalesce(q.insured, 0)::bigint AS insured,
    coalesce(q.uninsured, 0)::bigint AS uninsured,
    coalesce(q.errors, 0)::bigint AS errors,
    coalesce(e.error_events, 0)::bigint AS errorEvents,
    coalesce(q.pending, 0)::bigint AS pending,
    coalesce(q.incomplete, 0)::bigint AS incomplete,
    coalesce(q.contradictory, 0)::bigint AS contradictory,
    coalesce(q.duplicate_finals, 0)::bigint AS duplicateFinals
  FROM periods p
  LEFT JOIN query_deltas q ON q.period = p.period
  LEFT JOIN raw_error_deltas e ON e.period = p.period
)
SELECT jsonb_build_object(
  'cutoff', b.cutoff,
  'generatedAt', b.now_at,
  'periods', (SELECT jsonb_object_agg(period, jsonb_build_object(
    'consultations', consultations,
    'finals', finals,
    'insured', insured,
    'uninsured', uninsured,
    'errors', errors,
    'errorEvents', errorEvents,
    'pending', pending,
    'incomplete', incomplete,
    'contradictory', contradictory,
    'duplicateFinals', duplicateFinals
  )) FROM period_results)
)
FROM bounds b;
$function$

REVOKE ALL ON FUNCTION public.verix2_admin_insurance_delta_v1(timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_admin_insurance_delta_v1(timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) TO service_role;

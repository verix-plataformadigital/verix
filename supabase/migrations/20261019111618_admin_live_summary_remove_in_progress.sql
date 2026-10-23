-- The Admin dashboard focuses on current presence and recent query volume.
-- Individual vehicle queries typically complete very quickly, so "in progress"
-- snapshots are noisy and duplicate the recent-consultation metric.
-- Remove the anti-join for pending queries and return only useful live metrics.
CREATE OR REPLACE FUNCTION public.verix2_admin_live_summary_v1(
  p_now timestamp with time zone DEFAULT clock_timestamp()
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
SET work_mem TO '4MB'
AS $function$
WITH bounds AS (
  SELECT coalesce(p_now, clock_timestamp()) AS now_at
),
consultations_last_3m AS (
  SELECT count(DISTINCT e.query_id)::bigint AS consultations
  FROM public.verix2_events e
  CROSS JOIN bounds b
  WHERE e.event = 'vehicle_lookup'
    AND e.query_id IS NOT NULL
    AND e.created_at >= b.now_at - interval '3 minutes'
    AND e.created_at <= b.now_at + interval '30 seconds'
    AND e.occurred_at >= b.now_at - interval '3 minutes'
    AND e.occurred_at <= b.now_at + interval '30 seconds'
),
consulted_hour AS (
  SELECT count(DISTINCT e.installation_id)::bigint AS installations
  FROM public.verix2_events e
  CROSS JOIN bounds b
  WHERE e.event = 'vehicle_lookup'
    AND e.installation_id IS NOT NULL
    AND e.created_at >= b.now_at - interval '1 hour'
    AND e.created_at <= b.now_at + interval '30 seconds'
    AND e.occurred_at >= b.now_at - interval '1 hour'
    AND e.occurred_at <= b.now_at + interval '30 seconds'
),
seen_last_hour AS (
  SELECT count(DISTINCT e.installation_id)::bigint AS installations
  FROM public.verix2_events e
  CROSS JOIN bounds b
  WHERE e.installation_id IS NOT NULL
    AND e.session_id IS NOT NULL
    AND e.event IN ('app_open', 'heartbeat')
    AND e.created_at >= b.now_at - interval '1 hour'
    AND e.created_at <= b.now_at + interval '30 seconds'
    AND e.occurred_at >= b.now_at - interval '1 hour'
    AND e.occurred_at <= b.now_at + interval '30 seconds'
),
registered AS (
  SELECT count(*)::bigint AS installations
  FROM public.verix2_installations
)
SELECT jsonb_build_object(
  'consultationsLast3Minutes', (
    SELECT consultations FROM consultations_last_3m
  ),
  'installationsConsultedLastHour', (
    SELECT installations FROM consulted_hour
  ),
  'installationsSeenLastHour', (
    SELECT installations FROM seen_last_hour
  ),
  'registeredInstallations', (
    SELECT installations FROM registered
  ),
  'observedAt', (
    SELECT now_at FROM bounds
  )
);
$function$;

DO $assert$
DECLARE
  v jsonb;
BEGIN
  v := public.verix2_admin_live_summary_v1(clock_timestamp());

  IF jsonb_typeof(v->'consultationsLast3Minutes') <> 'number'
     OR jsonb_typeof(v->'installationsConsultedLastHour') <> 'number'
     OR jsonb_typeof(v->'installationsSeenLastHour') <> 'number'
     OR jsonb_typeof(v->'registeredInstallations') <> 'number'
     OR v->>'observedAt' IS NULL THEN
    RAISE EXCEPTION 'Admin live-summary contract assertion failed';
  END IF;

  IF v ? 'consultationsInProgress' OR v ? 'installationsQueryingNow' THEN
    RAISE EXCEPTION 'Obsolete in-progress query counters remain in the live summary';
  END IF;
END;
$assert$;

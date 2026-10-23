-- VÉRIX live-presence cleanup.
-- Supabase Realtime Presence is now the source for connected/active-now UI metrics.
-- Preserve all event history, installation records, existing indexes, and retention policy.
-- Keep only the database metrics still consumed by Admin.

CREATE OR REPLACE FUNCTION public.verix2_admin_live_activity_v3(
  p_now timestamp with time zone DEFAULT now()
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
)
SELECT jsonb_build_object(
  'consultations', (
    SELECT count(DISTINCT e.query_id)::bigint
    FROM public.verix2_events e
    CROSS JOIN bounds b
    WHERE e.event = 'vehicle_lookup'
      AND e.query_id IS NOT NULL
      AND e.created_at >= b.now_at - interval '3 minutes'
      AND e.created_at <= b.now_at + interval '30 seconds'
      AND e.occurred_at >= b.now_at - interval '3 minutes'
      AND e.occurred_at <= b.now_at + interval '30 seconds'
  ),
  'activeInstallations', (
    SELECT count(DISTINCT e.installation_id)::bigint
    FROM public.verix2_events e
    CROSS JOIN bounds b
    WHERE e.event = 'vehicle_lookup'
      AND e.query_id IS NOT NULL
      AND e.installation_id IS NOT NULL
      AND e.created_at >= b.now_at - interval '3 minutes'
      AND e.created_at <= b.now_at + interval '30 seconds'
      AND e.occurred_at >= b.now_at - interval '3 minutes'
      AND e.occurred_at <= b.now_at + interval '30 seconds'
  )
);
$function$;

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
recent_lookups AS (
  SELECT e.query_id, min(e.created_at) AS started_received
  FROM public.verix2_events e
  CROSS JOIN bounds b
  WHERE e.event = 'vehicle_lookup'
    AND e.query_id IS NOT NULL
    AND e.created_at >= b.now_at - interval '3 minutes'
    AND e.created_at <= b.now_at + interval '30 seconds'
    AND e.occurred_at >= b.now_at - interval '3 minutes'
    AND e.occurred_at <= b.now_at + interval '30 seconds'
  GROUP BY e.query_id
),
in_progress AS (
  SELECT l.query_id
  FROM recent_lookups l
  CROSS JOIN bounds b
  WHERE l.started_received >= b.now_at - interval '2 minutes'
    AND NOT EXISTS (
      SELECT 1
      FROM public.verix2_events f
      WHERE f.query_id = l.query_id
        AND f.event IN ('vehicle_insurance_yes', 'vehicle_insurance_no', 'vehicle_insurance_error')
        AND f.created_at >= l.started_received
        AND f.created_at <= b.now_at + interval '30 seconds'
    )
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
  'consultationsInProgress', (
    SELECT count(DISTINCT query_id)::bigint
    FROM in_progress
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

-- These RPCs are only called by the authenticated Admin Edge Function.
REVOKE ALL ON FUNCTION public.verix2_admin_live_activity_v3(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_admin_live_activity_v3(timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.verix2_admin_live_summary_v1(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_admin_live_summary_v1(timestamptz) TO service_role;

COMMENT ON FUNCTION public.verix2_admin_live_activity_v3(timestamptz)
IS 'Lightweight recent consultation counts only; connected/active presence is supplied by Supabase Realtime.';
COMMENT ON FUNCTION public.verix2_admin_live_summary_v1(timestamptz)
IS 'Admin database summary for query progress, hourly presence receipts and registered installation IDs. Live connected/active counts are supplied by Supabase Realtime. Telemetry history is preserved.';

-- Preserve the exact rolling 24-hour window in the chronological hourly grid.
CREATE OR REPLACE FUNCTION public.verix2_admin_hourly_24h(p_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
SET statement_timeout TO '5s'
AS $function$
WITH bounds AS (
  SELECT
    p_now - interval '24 hours' AS window_start,
    date_trunc('hour', p_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS current_hour
),
slots AS (
  -- Include the partial first hour as well as the current hour. This can yield
  -- 25 clock-hour buckets, but the events represented cover exactly the last 24 hours.
  SELECT generate_series(
    date_trunc('hour', window_start AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
    current_hour,
    interval '1 hour'
  ) AS slot_start
  FROM bounds
),
hour_events AS (
  SELECT
    date_trunc('hour', e.occurred_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS slot_start,
    count(DISTINCT e.query_id) FILTER (
      WHERE e.event = 'vehicle_lookup' AND e.query_id IS NOT NULL
    ) AS consultations,
    count(DISTINCT e.installation_id) FILTER (
      WHERE e.event IN ('app_open', 'heartbeat')
    ) AS users,
    count(DISTINCT e.session_id) FILTER (
      WHERE e.event IN ('app_open', 'heartbeat') AND e.session_id IS NOT NULL
    ) AS sessions
  FROM public.verix2_events e, bounds b
  WHERE e.occurred_at >= b.window_start
    AND e.occurred_at < b.current_hour + interval '1 hour'
  GROUP BY 1
)
SELECT coalesce(
  jsonb_agg(
    jsonb_build_object(
      'hour_key', s.slot_start,
      'hour_num', extract(hour FROM (s.slot_start AT TIME ZONE 'Europe/Lisbon'))::int,
      'hour_label', to_char(s.slot_start AT TIME ZONE 'Europe/Lisbon', 'DD/MM HH24') || 'h',
      'consultations', coalesce(e.consultations, 0),
      'actions', coalesce(e.consultations, 0),
      'users', coalesce(e.users, 0),
      'sessions', coalesce(e.sessions, 0)
    )
    ORDER BY s.slot_start
  ),
  '[]'::jsonb
)
FROM slots s
LEFT JOIN hour_events e USING (slot_start);
$function$;

REVOKE ALL ON FUNCTION public.verix2_admin_hourly_24h(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_admin_hourly_24h(timestamptz) TO service_role;
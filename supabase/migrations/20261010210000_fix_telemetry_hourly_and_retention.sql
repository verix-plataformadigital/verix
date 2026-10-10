-- Correct hourly telemetry buckets, lifetime totals and retention policy.
-- Does not modify verix-app.html, ASF transport, or vehicle query behavior.

CREATE OR REPLACE FUNCTION public.verix2_admin_hourly_24h(p_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
SET statement_timeout TO '5s'
AS $function$
WITH bounds AS (
  SELECT date_trunc('hour', p_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS current_hour
),
slots AS (
  SELECT generate_series(
    current_hour - interval '23 hours',
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
  WHERE e.occurred_at >= b.current_hour - interval '23 hours'
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

CREATE OR REPLACE FUNCTION public.verix2_cleanup_old_data(
  p_before timestamptz DEFAULT (now() - interval '365 days')
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  deleted_events bigint := 0;
  deleted_rate_limits bigint := 0;
  deleted_no_insurance bigint := 0;
  deleted_sessions bigint := 0;
  deleted_installations bigint := 0;
BEGIN
  DELETE FROM public.verix2_events WHERE occurred_at < p_before;
  GET DIAGNOSTICS deleted_events = ROW_COUNT;

  DELETE FROM public.verix2_rate_limits
  WHERE window_started < now() - interval '24 hours';
  GET DIAGNOSTICS deleted_rate_limits = ROW_COUNT;

  DELETE FROM public.verix_insurance_no_cases WHERE expires_at < now();
  GET DIAGNOSTICS deleted_no_insurance = ROW_COUNT;

  DELETE FROM public.verix2_sessions s
  WHERE s.last_seen < p_before
    AND NOT EXISTS (
      SELECT 1 FROM public.verix2_events e WHERE e.session_id = s.session_id
    );
  GET DIAGNOSTICS deleted_sessions = ROW_COUNT;

  DELETE FROM public.verix2_installations i
  WHERE i.last_seen < p_before
    AND NOT EXISTS (
      SELECT 1 FROM public.verix2_events e WHERE e.installation_id = i.installation_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.verix2_sessions s WHERE s.installation_id = i.installation_id
    );
  GET DIAGNOSTICS deleted_installations = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'before', p_before,
    'retention_days', 365,
    'deleted_events', deleted_events,
    'deleted_rate_limits', deleted_rate_limits,
    'deleted_no_insurance_cases', deleted_no_insurance,
    'deleted_sessions', deleted_sessions,
    'deleted_installations', deleted_installations
  );
END;
$function$;

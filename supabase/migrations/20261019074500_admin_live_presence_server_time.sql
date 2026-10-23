-- Correct VÉRIX live-presence metrics using server receipt timestamps.
-- Reports browser sessions/installation IDs, not authenticated people.
-- Stale events queued offline must not revive an online session.
-- Historical telemetry is untouched; ASF lookup engine is untouched.

CREATE INDEX IF NOT EXISTS verix2_events_presence_server_time_idx
  ON public.verix2_events (created_at DESC, session_id)
  INCLUDE (installation_id, event, occurred_at)
  WHERE event IN ('app_open', 'heartbeat', 'session_close');

CREATE OR REPLACE FUNCTION public.verix2_admin_live_presence(
  p_now timestamp with time zone DEFAULT now()
)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
SET work_mem TO '8MB'
AS $function$
WITH p AS MATERIALIZED (
  -- p_now comes from the server-side Admin API, never from the browser.
  SELECT coalesce(p_now, clock_timestamp()) AS n
),
recent_presence_events AS MATERIALIZED (
  SELECT e.session_id, e.installation_id, e.event, e.occurred_at, e.created_at
  FROM public.verix2_events e CROSS JOIN p
  WHERE e.session_id IS NOT NULL
    AND e.event IN ('app_open', 'heartbeat', 'session_close')
    -- Require freshness on both clocks; an offline queue cannot revive an old heartbeat.
    AND e.created_at >= p.n - interval '90 seconds'
    AND e.created_at <= p.n + interval '30 seconds'
    AND e.occurred_at >= p.n - interval '90 seconds'
    AND e.occurred_at <= p.n + interval '30 seconds'
),
presence_state AS MATERIALIZED (
  SELECT session_id, installation_id,
    max(created_at) FILTER (WHERE event IN ('app_open', 'heartbeat')) AS last_presence_received_at,
    max(created_at) FILTER (WHERE event = 'session_close') AS last_close_received_at,
    max(occurred_at) FILTER (WHERE event IN ('app_open', 'heartbeat')) AS last_presence_occurred_at,
    max(occurred_at) FILTER (WHERE event = 'session_close') AS last_close_occurred_at
  FROM recent_presence_events
  GROUP BY session_id, installation_id
),
online_sessions AS MATERIALIZED (
  SELECT session_id, installation_id
  FROM presence_state CROSS JOIN p
  WHERE last_presence_received_at >= p.n - interval '90 seconds'
    AND (
      last_close_received_at IS NULL
      OR last_presence_received_at > last_close_received_at
      -- Multiple events accepted in the same database transaction share created_at.
      -- Use the fresh client occurrence timestamp only to break that exact tie.
      OR (
        last_presence_received_at = last_close_received_at
        AND last_presence_occurred_at > last_close_occurred_at
      )
    )
),
presence_last_hour AS MATERIALIZED (
  SELECT DISTINCT e.session_id, e.installation_id
  FROM public.verix2_events e CROSS JOIN p
  WHERE e.session_id IS NOT NULL
    AND e.event IN ('app_open', 'heartbeat', 'session_close')
    AND e.occurred_at >= p.n - interval '1 hour'
    AND e.occurred_at <= p.n + interval '30 seconds'
),
real_activity_last_hour AS MATERIALIZED (
  SELECT DISTINCT e.session_id, e.installation_id
  FROM public.verix2_events e CROSS JOIN p
  WHERE e.event NOT IN ('app_open', 'heartbeat', 'session_close')
    AND e.occurred_at >= p.n - interval '1 hour'
    AND e.occurred_at <= p.n + interval '30 seconds'
),
consultations_last_hour AS (
  SELECT count(DISTINCT e.query_id)::bigint AS total
  FROM public.verix2_events e CROSS JOIN p
  WHERE e.event = 'vehicle_lookup' AND e.query_id IS NOT NULL
    AND e.occurred_at >= p.n - interval '1 hour'
    AND e.occurred_at <= p.n + interval '30 seconds'
),
queries_in_progress AS MATERIALIZED (
  SELECT DISTINCT q.query_id, q.session_id, q.installation_id
  FROM public.verix2_events q
  JOIN online_sessions os ON os.session_id = q.session_id AND os.installation_id = q.installation_id
  CROSS JOIN p
  WHERE q.event = 'vehicle_lookup'
    AND q.query_id IS NOT NULL
    AND q.created_at >= p.n - interval '5 minutes'
    AND q.created_at <= p.n + interval '30 seconds'
    AND q.occurred_at >= p.n - interval '5 minutes'
    AND q.occurred_at <= p.n + interval '30 seconds'
    AND NOT EXISTS (
      SELECT 1 FROM public.verix2_events f
      WHERE f.query_id = q.query_id
        AND f.event IN ('vehicle_insurance_yes', 'vehicle_insurance_no', 'vehicle_insurance_error')
        AND f.created_at >= q.created_at
    )
)
SELECT jsonb_build_object(
  'observed_at', (SELECT n FROM p),
  'presence_lease_seconds', 90,
  'registered_installations', (SELECT count(*)::bigint FROM public.verix2_installations),
  'online_now', (SELECT count(*)::bigint FROM online_sessions),
  'online_sessions', (SELECT count(*)::bigint FROM online_sessions),
  'online_installations', (SELECT count(DISTINCT installation_id)::bigint FROM online_sessions),
  'querying_sessions_now', (SELECT count(DISTINCT session_id)::bigint FROM queries_in_progress),
  'consultations_in_progress', (SELECT count(DISTINCT query_id)::bigint FROM queries_in_progress),
  'sessions_seen_last_hour', (SELECT count(DISTINCT session_id)::bigint FROM presence_last_hour),
  'installations_seen_last_hour', (SELECT count(DISTINCT installation_id)::bigint FROM presence_last_hour),
  'active_sessions_last_hour', (SELECT count(DISTINCT session_id)::bigint FROM real_activity_last_hour),
  'active_installations_last_hour', (SELECT count(DISTINCT installation_id)::bigint FROM real_activity_last_hour),
  'consultations_started_last_hour', (SELECT total FROM consultations_last_hour)
);
$function$;

REVOKE ALL ON FUNCTION public.verix2_admin_live_presence(timestamp with time zone)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_admin_live_presence(timestamp with time zone) TO service_role;

DO $check$
DECLARE
  v jsonb;
  k text;
BEGIN
  v := public.verix2_admin_live_presence(clock_timestamp());
  FOREACH k IN ARRAY ARRAY[
    'observed_at','registered_installations','online_now','online_sessions',
    'online_installations','querying_sessions_now','consultations_in_progress',
    'sessions_seen_last_hour','installations_seen_last_hour',
    'active_sessions_last_hour','active_installations_last_hour',
    'consultations_started_last_hour'
  ] LOOP
    IF NOT (v ? k) THEN RAISE EXCEPTION 'Live presence metric missing: %', k; END IF;
  END LOOP;
  IF (v->>'registered_installations')::bigint < 0
     OR (v->>'online_sessions')::bigint < 0
     OR (v->>'online_installations')::bigint < 0
     OR (v->>'consultations_in_progress')::bigint < 0 THEN
    RAISE EXCEPTION 'Live presence metrics must never be negative';
  END IF;
END
$check$;

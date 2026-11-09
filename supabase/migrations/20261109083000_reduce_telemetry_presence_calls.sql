-- Add a server-authoritative 2-minute activity counter to live Admin presence.
-- Activity must be an operational event from a session that is currently online;
-- offline queue replays and heartbeat-only traffic must not count as active use.
CREATE OR REPLACE FUNCTION public.verix2_admin_live_presence(
  p_now timestamp with time zone DEFAULT now()
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
SET work_mem TO '8MB'
AS $function$
WITH p AS MATERIALIZED (
  SELECT coalesce(p_now, clock_timestamp()) AS n
),
online_sessions AS MATERIALIZED (
  SELECT s.session_id, s.installation_id
  FROM public.verix2_sessions s
  CROSS JOIN p
  WHERE s.last_seen >= p.n - interval '120 seconds'
    AND s.last_seen <= p.n + interval '30 seconds'
    AND NOT EXISTS (
      SELECT 1
      FROM public.verix2_events c
      WHERE c.session_id = s.session_id
        AND c.event = 'session_close'
        AND c.created_at >= p.n - interval '120 seconds'
        AND c.created_at <= p.n + interval '30 seconds'
    )
),
active_sessions_last_2m AS MATERIALIZED (
  SELECT DISTINCT e.session_id, e.installation_id
  FROM public.verix2_events e
  JOIN online_sessions os
    ON os.session_id = e.session_id
   AND os.installation_id = e.installation_id
  CROSS JOIN p
  WHERE e.session_id IS NOT NULL
    AND e.event NOT IN ('app_open', 'heartbeat', 'session_close')
    AND e.created_at >= p.n - interval '2 minutes'
    AND e.created_at <= p.n + interval '30 seconds'
    AND e.occurred_at >= p.n - interval '2 minutes'
    AND e.occurred_at <= p.n + interval '30 seconds'
),
presence_last_hour AS MATERIALIZED (
  SELECT DISTINCT s.session_id, s.installation_id
  FROM public.verix2_sessions s
  CROSS JOIN p
  WHERE s.last_seen >= p.n - interval '1 hour'
    AND s.last_seen <= p.n + interval '30 seconds'
),
real_activity_last_hour AS MATERIALIZED (
  SELECT DISTINCT e.session_id, e.installation_id
  FROM public.verix2_events e
  CROSS JOIN p
  WHERE e.session_id IS NOT NULL
    AND e.event NOT IN ('app_open', 'heartbeat', 'session_close')
    AND e.occurred_at >= p.n - interval '1 hour'
    AND e.occurred_at <= p.n + interval '30 seconds'
),
consultations_last_hour AS (
  SELECT count(DISTINCT e.query_id)::bigint AS total
  FROM public.verix2_events e
  CROSS JOIN p
  WHERE e.event = 'vehicle_lookup'
    AND e.query_id IS NOT NULL
    AND e.occurred_at >= p.n - interval '1 hour'
    AND e.occurred_at <= p.n + interval '30 seconds'
),
queries_in_progress AS MATERIALIZED (
  SELECT DISTINCT q.query_id, q.session_id, q.installation_id
  FROM public.verix2_events q
  JOIN online_sessions os
    ON os.session_id = q.session_id
   AND os.installation_id = q.installation_id
  CROSS JOIN p
  WHERE q.event = 'vehicle_lookup'
    AND q.query_id IS NOT NULL
    AND q.created_at >= p.n - interval '5 minutes'
    AND q.created_at <= p.n + interval '30 seconds'
    AND q.occurred_at >= p.n - interval '5 minutes'
    AND q.occurred_at <= p.n + interval '30 seconds'
    AND NOT EXISTS (
      SELECT 1
      FROM public.verix2_events f
      WHERE f.query_id = q.query_id
        AND f.event IN ('vehicle_insurance_yes', 'vehicle_insurance_no', 'vehicle_insurance_error')
        AND f.created_at >= q.created_at
    )
)
SELECT jsonb_build_object(
  'observed_at', (SELECT n FROM p),
  'presence_lease_seconds', 120,
  'registered_installations', (SELECT count(*)::bigint FROM public.verix2_installations),
  'online_now', (SELECT count(*)::bigint FROM online_sessions),
  'online_sessions', (SELECT count(*)::bigint FROM online_sessions),
  'online_installations', (SELECT count(DISTINCT installation_id)::bigint FROM online_sessions),
  'active_sessions_last_2m', (SELECT count(DISTINCT session_id)::bigint FROM active_sessions_last_2m),
  'active_installations_last_2m', (SELECT count(DISTINCT installation_id)::bigint FROM active_sessions_last_2m),
  'querying_sessions_now', (SELECT count(DISTINCT session_id)::bigint FROM queries_in_progress),
  'consultations_in_progress', (SELECT count(DISTINCT query_id)::bigint FROM queries_in_progress),
  'sessions_seen_last_hour', (SELECT count(DISTINCT session_id)::bigint FROM presence_last_hour),
  'installations_seen_last_hour', (SELECT count(DISTINCT installation_id)::bigint FROM presence_last_hour),
  'active_sessions_last_hour', (SELECT count(DISTINCT session_id)::bigint FROM real_activity_last_hour),
  'active_installations_last_hour', (SELECT count(DISTINCT installation_id)::bigint FROM real_activity_last_hour),
  'consultations_started_last_hour', (SELECT total FROM consultations_last_hour)
);
$function$;

DO $assert$
DECLARE
  v jsonb;
BEGIN
  v := public.verix2_admin_live_presence(clock_timestamp());
  IF (v->>'presence_lease_seconds')::integer <> 120
     OR jsonb_typeof(v->'online_installations') <> 'number'
     OR jsonb_typeof(v->'active_sessions_last_2m') <> 'number'
     OR jsonb_typeof(v->'active_installations_last_2m') <> 'number'
     OR (v->>'active_installations_last_2m')::bigint >
        (v->>'online_installations')::bigint THEN
    RAISE EXCEPTION 'Live Admin presence 2-minute activity contract assertion failed';
  END IF;
END;
$assert$;

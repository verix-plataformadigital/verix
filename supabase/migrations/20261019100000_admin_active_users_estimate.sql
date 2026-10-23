-- VÉRIX Admin: separate recently connected installations from recently active users.
-- "activeNow" is a pragmatic estimate: a unique installation must have a fresh
-- server-received presence signal and at least one real interaction within 5 minutes.
-- It is not an authenticated count of physical people.
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
presence_events AS (
  SELECT
    e.session_id,
    e.installation_id,
    e.event,
    e.occurred_at,
    e.created_at
  FROM public.verix2_events e
  CROSS JOIN bounds b
  WHERE e.session_id IS NOT NULL
    AND e.installation_id IS NOT NULL
    AND e.event IN ('app_open', 'heartbeat', 'session_close')
    -- Both client and server timestamps must be recent; replayed offline queues
    -- cannot make an old session appear online.
    AND e.created_at >= b.now_at - interval '3 minutes'
    AND e.created_at <= b.now_at + interval '30 seconds'
    AND e.occurred_at >= b.now_at - interval '3 minutes'
    AND e.occurred_at <= b.now_at + interval '30 seconds'
),
session_state AS (
  SELECT
    session_id,
    installation_id,
    max(created_at) FILTER (WHERE event IN ('app_open', 'heartbeat')) AS last_signal,
    max(created_at) FILTER (WHERE event = 'session_close') AS last_close,
    max(occurred_at) FILTER (WHERE event IN ('app_open', 'heartbeat')) AS last_signal_occurred,
    max(occurred_at) FILTER (WHERE event = 'session_close') AS last_close_occurred
  FROM presence_events
  GROUP BY session_id, installation_id
),
online_sessions AS (
  SELECT s.session_id, s.installation_id
  FROM session_state s
  CROSS JOIN bounds b
  WHERE s.last_signal >= b.now_at - interval '150 seconds'
    AND (
      s.last_close IS NULL
      OR s.last_signal > s.last_close
      OR (
        s.last_signal = s.last_close
        AND s.last_signal_occurred > s.last_close_occurred
      )
    )
),
recent_real_activity AS (
  SELECT DISTINCT e.installation_id
  FROM public.verix2_events e
  CROSS JOIN bounds b
  WHERE e.installation_id IS NOT NULL
    AND e.session_id IS NOT NULL
    AND e.event NOT IN ('app_open', 'heartbeat', 'session_close')
    AND e.created_at >= b.now_at - interval '5 minutes'
    AND e.created_at <= b.now_at + interval '30 seconds'
    AND e.occurred_at >= b.now_at - interval '5 minutes'
    AND e.occurred_at <= b.now_at + interval '30 seconds'
),
recent_lookups AS (
  SELECT e.query_id, min(e.created_at) AS started_received
  FROM public.verix2_events e
  CROSS JOIN bounds b
  WHERE e.event = 'vehicle_lookup'
    AND e.query_id IS NOT NULL
    AND e.created_at >= b.now_at - interval '3 minutes'
    AND e.created_at <= b.now_at + interval '30 seconds'
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
),
registered AS (
  SELECT count(*)::bigint AS installations
  FROM public.verix2_installations
)
SELECT jsonb_build_object(
  'onlineNow', (
    SELECT count(DISTINCT installation_id)::bigint
    FROM online_sessions
  ),
  'onlineSessions', (
    SELECT count(DISTINCT session_id)::bigint
    FROM online_sessions
  ),
  'activeNow', (
    SELECT count(DISTINCT os.installation_id)::bigint
    FROM online_sessions os
    JOIN recent_real_activity a ON a.installation_id = os.installation_id
  ),
  'consultationsInProgress', (
    SELECT count(DISTINCT query_id)::bigint
    FROM in_progress
  ),
  'installationsConsultedLastHour', (
    SELECT installations FROM consulted_hour
  ),
  'registeredInstallations', (
    SELECT installations FROM registered
  ),
  'observedAt', (
    SELECT now_at FROM bounds
  ),
  'activeWindowSeconds', 300,
  'presenceLeaseSeconds', 150
);
$function$;

REVOKE ALL ON FUNCTION public.verix2_admin_live_summary_v1(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_admin_live_summary_v1(timestamptz) TO service_role;

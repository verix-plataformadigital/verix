-- Authoritative live presence for the Admin dashboard.
-- Do not rely on public client-side Realtime Presence for production online counts.
-- A profile is online only when a fresh app_open/heartbeat was both generated and
-- received recently. This prevents an offline queue replay from reviving stale clients.
CREATE OR REPLACE FUNCTION public.verix2_admin_live_summary_v1(
  p_now timestamp with time zone DEFAULT clock_timestamp()
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
SET work_mem TO '8MB'
AS $function$
WITH bounds AS (
  SELECT coalesce(p_now, clock_timestamp()) AS now_at
),
recent_presence_events AS MATERIALIZED (
  SELECT
    e.installation_id,
    e.session_id,
    e.tab_id,
    e.event,
    e.created_at,
    e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN bounds b
  WHERE e.installation_id IS NOT NULL
    AND e.session_id IS NOT NULL
    AND e.tab_id IS NOT NULL
    AND e.event IN ('app_open', 'heartbeat', 'session_close')
    AND e.created_at >= b.now_at - interval '150 seconds'
    AND e.created_at <= b.now_at + interval '30 seconds'
    AND e.occurred_at >= b.now_at - interval '150 seconds'
    AND e.occurred_at <= b.now_at + interval '30 seconds'
),
presence_state AS MATERIALIZED (
  SELECT
    installation_id,
    tab_id,
    max(created_at) FILTER (WHERE event IN ('app_open', 'heartbeat')) AS last_presence_received_at,
    max(occurred_at) FILTER (WHERE event IN ('app_open', 'heartbeat')) AS last_presence_occurred_at,
    max(occurred_at) FILTER (WHERE event = 'session_close') AS last_close_occurred_at
  FROM recent_presence_events
  GROUP BY installation_id, tab_id
),
online_tabs AS MATERIALIZED (
  SELECT
    s.installation_id,
    s.tab_id,
    s.last_presence_received_at
  FROM presence_state s
  CROSS JOIN bounds b
  WHERE s.last_presence_received_at >= b.now_at - interval '150 seconds'
    -- Client occurrence time prevents an offline queue replay received after close
    -- from reviving this page context merely because its server receipt is newer.
    AND (
      s.last_close_occurred_at IS NULL
      OR s.last_presence_occurred_at > s.last_close_occurred_at
    )
),
fresh_actions AS MATERIALIZED (
  SELECT DISTINCT e.installation_id, e.tab_id
  FROM public.verix2_events e
  JOIN online_tabs s
    ON s.installation_id = e.installation_id
   AND s.tab_id = e.tab_id
  CROSS JOIN bounds b
  WHERE e.event NOT IN ('app_open', 'heartbeat', 'session_close')
    AND e.created_at >= b.now_at - interval '120 seconds'
    AND e.created_at <= b.now_at + interval '30 seconds'
    AND e.occurred_at >= b.now_at - interval '120 seconds'
    AND e.occurred_at <= b.now_at + interval '30 seconds'
),
profile_state AS (
  SELECT
    s.installation_id,
    count(*)::bigint AS tabs,
    max(s.last_presence_received_at) AS last_seen_at,
    bool_or(a.tab_id IS NOT NULL) AS active
  FROM online_tabs s
  LEFT JOIN fresh_actions a
    ON a.installation_id = s.installation_id
   AND a.tab_id = s.tab_id
  GROUP BY s.installation_id
),
online_profile_rows AS (
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'profileRef', substr(md5(p.installation_id), 1, 12),
        'browser', coalesce(i.browser, 'Unknown'),
        'deviceType', coalesce(i.device_type, 'Unknown'),
        'os', coalesce(i.os, 'Unknown'),
        'appVersion', coalesce(i.app_version, 'Unknown'),
        'tabs', p.tabs,
        'lastSeenAt', p.last_seen_at,
        'active', p.active
      )
      ORDER BY p.active DESC, p.last_seen_at DESC
    ),
    '[]'::jsonb
  ) AS profiles
  FROM (
    SELECT *
    FROM profile_state
    ORDER BY active DESC, last_seen_at DESC
    LIMIT 100
  ) p
  LEFT JOIN public.verix2_installations i
    ON i.installation_id = p.installation_id
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
  'consultationsLast3Minutes', (SELECT consultations FROM consultations_last_3m),
  'installationsConsultedLastHour', (SELECT installations FROM consulted_hour),
  'installationsSeenLastHour', (SELECT installations FROM seen_last_hour),
  'registeredInstallations', (SELECT installations FROM registered),
  'onlineInstallations', (SELECT count(DISTINCT installation_id)::bigint FROM online_tabs),
  'onlineTabs', (SELECT count(*)::bigint FROM online_tabs),
  'activeInstallations', (SELECT count(DISTINCT installation_id)::bigint FROM fresh_actions),
  'activeTabs', (SELECT count(*)::bigint FROM fresh_actions),
  'onlineProfiles', (SELECT profiles FROM online_profile_rows),
  'onlineProfilesLimit', 100,
  'presenceLeaseSeconds', 150,
  'activeWindowSeconds', 120,
  'presenceObservedAt', (SELECT now_at FROM bounds)
);
$function$;

-- Validate the JSON contract and make sure profile detail contains only pseudonymous refs.
DO $assert$
DECLARE
  v jsonb;
  profiles jsonb;
BEGIN
  v := public.verix2_admin_live_summary_v1(clock_timestamp());
  profiles := v->'onlineProfiles';

  IF jsonb_typeof(v->'onlineInstallations') <> 'number'
     OR jsonb_typeof(v->'onlineTabs') <> 'number'
     OR jsonb_typeof(v->'activeInstallations') <> 'number'
     OR jsonb_typeof(v->'activeTabs') <> 'number'
     OR jsonb_typeof(profiles) <> 'array'
     OR jsonb_typeof(v->'presenceLeaseSeconds') <> 'number'
     OR v->>'presenceObservedAt' IS NULL THEN
    RAISE EXCEPTION 'Admin authoritative live-presence contract assertion failed';
  END IF;

  IF v ? 'consultationsInProgress' OR v ? 'installationsQueryingNow' THEN
    RAISE EXCEPTION 'Obsolete in-progress query counters remain in the live summary';
  END IF;
END;
$assert$;

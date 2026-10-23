BEGIN;

-- Keep the 24-hour investigation grouped into real chronological hour buckets.
-- Every result includes the UTC bucket start; the Admin converts it to Europe/Lisbon
-- and labels each day separately, so 08:00 yesterday can never merge with 08:00 today.
CREATE OR REPLACE FUNCTION public.verix2_admin_hourly_active_interactions(
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
SET work_mem TO '8MB'
AS $function$
WITH bounds AS (
  SELECT
    greatest(
      p_now - interval '24 hours',
      coalesce(
        (SELECT reset_24h_at
         FROM public.verix2_dashboard_state
         WHERE singleton = true),
        '1970-01-01T00:00:00Z'::timestamptz
      )
    ) AS start_at,
    p_now AS end_at
),
hour_bounds AS (
  SELECT
    date_trunc('hour', start_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS first_bucket,
    date_trunc('hour', end_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS last_bucket
  FROM bounds
),
hours AS (
  SELECT g.bucket_start
  FROM hour_bounds b
  CROSS JOIN LATERAL generate_series(
    b.first_bucket,
    b.last_bucket,
    interval '1 hour'
  ) AS g(bucket_start)
),
consultations AS (
  SELECT
    date_trunc('hour', e.occurred_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS bucket_start,
    count(DISTINCT e.query_id) AS consultations
  FROM public.verix2_events e
  CROSS JOIN bounds b
  WHERE e.event = 'vehicle_lookup'
    AND e.query_id IS NOT NULL
    AND e.occurred_at >= b.start_at
    AND e.occurred_at < b.end_at
  GROUP BY 1
),
active_use AS (
  SELECT
    date_trunc('hour', e.occurred_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS bucket_start,
    count(DISTINCT e.installation_id) AS active_users,
    count(DISTINCT e.session_id) AS active_sessions,
    count(*) AS actions
  FROM public.verix2_events e
  CROSS JOIN bounds b
  WHERE e.occurred_at >= b.start_at
    AND e.occurred_at < b.end_at
    AND e.event IN (
      'vehicle_lookup',
      'vehicle_insurance_pending',
      'vehicle_insurance_yes',
      'vehicle_insurance_no',
      'vehicle_insurance_error',
      'imt_loaded',
      'module_open',
      'history_open',
      'history_reopen',
      'external_tool_open',
      'alcohol_lookup',
      'cinemometer_operation_start',
      'cinemometer_speed_entry',
      'cinemometer_calculation',
      'cinemometer_copy_code',
      'cinemometer_copy_text',
      'cinemometer_copy_location',
      'cinemometer_profile_select',
      'cinemometer_profile_new',
      'cinemometer_profile_duplicate',
      'cinemometer_profile_delete',
      'cinemometer_profile_save',
      'legislation_category_open',
      'legislation_search',
      'legislation_copy',
      'legislation_favorite_toggle'
    )
  GROUP BY 1
)
SELECT coalesce(
  jsonb_agg(
    jsonb_build_object(
      'bucket_start', h.bucket_start,
      'hour_num', extract(hour FROM h.bucket_start AT TIME ZONE 'Europe/Lisbon')::integer,
      'consultations', coalesce(c.consultations, 0),
      'actions', coalesce(a.actions, 0),
      'users', coalesce(a.active_users, 0),
      'active_users', coalesce(a.active_users, 0),
      'sessions', coalesce(a.active_sessions, 0)
    )
    ORDER BY h.bucket_start
  ),
  '[]'::jsonb
)
FROM hours h
LEFT JOIN consultations c USING (bucket_start)
LEFT JOIN active_use a USING (bucket_start);
$function$;

REVOKE ALL ON FUNCTION public.verix2_admin_hourly_active_interactions(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_admin_hourly_active_interactions(timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.verix2_admin_hourly_active_interactions(timestamptz) IS
  'Chronological hourly buckets with absolute bucket_start timestamps. Consultations and estimated active installations based on explicit Verix interaction events; excludes passive browser-open and heartbeat events.';

COMMIT;

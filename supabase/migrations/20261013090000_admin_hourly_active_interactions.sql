BEGIN;

-- Estimate real hourly use from explicit interaction events.
-- app_open, heartbeat and session_close are deliberately excluded:
-- an open browser or a background heartbeat alone is not active use.
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
consultations AS (
  SELECT
    extract(hour FROM e.occurred_at AT TIME ZONE 'Europe/Lisbon')::integer AS hour_num,
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
    extract(hour FROM e.occurred_at AT TIME ZONE 'Europe/Lisbon')::integer AS hour_num,
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
      'hour_num', h.hour_num,
      'consultations', coalesce(c.consultations, 0),
      'actions', coalesce(a.actions, 0),
      'users', coalesce(a.active_users, 0),
      'active_users', coalesce(a.active_users, 0),
      'sessions', coalesce(a.active_sessions, 0)
    )
    ORDER BY h.hour_num
  ),
  '[]'::jsonb
)
FROM generate_series(0, 23) AS h(hour_num)
LEFT JOIN consultations c USING (hour_num)
LEFT JOIN active_use a USING (hour_num);
$function$;

REVOKE ALL ON FUNCTION public.verix2_admin_hourly_active_interactions(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_admin_hourly_active_interactions(timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.verix2_admin_hourly_active_interactions(timestamptz) IS
  'Hourly consultations and estimated active installations based on explicit Verix interaction events; excludes passive browser-open and heartbeat events.';

COMMIT;

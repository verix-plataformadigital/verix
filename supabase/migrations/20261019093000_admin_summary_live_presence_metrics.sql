-- Summary presence metrics: use server receipt time for online state and preserve historical event timestamps.
CREATE OR REPLACE FUNCTION public.verix2_admin_live_activity_v3(
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_catalog
SET work_mem TO '4MB'
AS $function$
WITH presence AS (
  SELECT session_id,
         max(created_at) FILTER (WHERE event IN ('app_open','heartbeat')) AS last_seen_server,
         max(created_at) FILTER (WHERE event='session_close') AS last_close_server
  FROM public.verix2_events
  WHERE session_id IS NOT NULL
    AND event IN ('app_open','heartbeat','session_close')
    AND created_at >= p_now - interval '3 minutes'
    AND created_at <= p_now + interval '30 seconds'
  GROUP BY session_id
),
live_queries AS (
  SELECT q.query_id, q.installation_id, q.session_id, q.created_at AS started_server
  FROM public.verix2_events q
  WHERE q.event='vehicle_lookup'
    AND q.query_id IS NOT NULL
    AND q.created_at >= p_now - interval '10 minutes'
    AND q.created_at <= p_now + interval '30 seconds'
    AND NOT EXISTS (
      SELECT 1 FROM public.verix2_events f
      WHERE f.query_id=q.query_id
        AND f.event IN ('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')
        AND f.created_at >= q.created_at
        AND f.created_at <= p_now + interval '30 seconds'
    )
),
recent_activity AS (
  SELECT count(DISTINCT installation_id) AS installations
  FROM public.verix2_events
  WHERE installation_id IS NOT NULL
    AND event IN (
      'vehicle_lookup','vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error',
      'imt_loaded','module_open','history_open','history_reopen','external_tool_open',
      'alcohol_lookup','cinemometer_operation_start','cinemometer_speed_entry',
      'cinemometer_calculation','cinemometer_copy_code','cinemometer_copy_text',
      'cinemometer_copy_location','cinemometer_profile_select','cinemometer_profile_new',
      'cinemometer_profile_duplicate','cinemometer_profile_delete','cinemometer_profile_save',
      'legislation_category_open','legislation_search','legislation_copy','legislation_favorite_toggle'
    )
    AND created_at >= p_now - interval '1 hour'
    AND created_at <= p_now + interval '30 seconds'
)
SELECT jsonb_build_object(
  'consultations',
    (SELECT count(DISTINCT query_id) FROM public.verix2_events
      WHERE event='vehicle_lookup' AND query_id IS NOT NULL
        AND created_at >= p_now - interval '3 minutes' AND created_at <= p_now + interval '30 seconds'),
  'activeInstallations',
    (SELECT count(DISTINCT installation_id) FROM public.verix2_events
      WHERE event='vehicle_lookup' AND query_id IS NOT NULL AND installation_id IS NOT NULL
        AND created_at >= p_now - interval '3 minutes' AND created_at <= p_now + interval '30 seconds'),
  'onlineNow',
    (SELECT count(*) FROM presence
      WHERE last_seen_server >= p_now - interval '90 seconds'
        AND (last_close_server IS NULL OR last_seen_server > last_close_server)),
  'consultationsInProgress',
    (SELECT count(DISTINCT q.query_id) FROM live_queries q
      WHERE EXISTS (
        SELECT 1 FROM presence p
        WHERE p.session_id=q.session_id
          AND p.last_seen_server >= p_now - interval '90 seconds'
          AND (p.last_close_server IS NULL OR p.last_seen_server > p.last_close_server)
      )),
  'activeInstallationsLastHour', (SELECT installations FROM recent_activity),
  'registeredInstallations', (SELECT count(*) FROM public.verix2_installations)
);
$function$;

REVOKE ALL ON FUNCTION public.verix2_admin_live_activity_v3(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_admin_live_activity_v3(timestamptz) TO service_role;

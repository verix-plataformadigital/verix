-- Daily trend from the exact stable-release reset timestamp through the current Lisbon date.
-- The reset day is present but only counts events at/after reset_all_at.
CREATE OR REPLACE FUNCTION public.verix2_admin_daily_trend_since_reset(p_now timestamp with time zone DEFAULT now())
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog' SET work_mem TO '16MB'
AS $function$
WITH reset_marker AS (
 SELECT coalesce(
   (SELECT reset_all_at FROM public.verix2_admin_dashboard_cache WHERE singleton = true),
   p_now - interval '365 days'
 ) AS reset_at
), local_dates AS (
 SELECT (reset_at AT TIME ZONE 'Europe/Lisbon')::date AS first_day,
        (p_now AT TIME ZONE 'Europe/Lisbon')::date AS last_day,
        reset_at, p_now AS report_end
 FROM reset_marker
),
bounds AS (
 SELECT first_day,last_day,reset_at AS start_at,report_end AS end_at FROM local_dates
),
days AS (
 SELECT generate_series(first_day,last_day,interval '1 day')::date AS report_day FROM local_dates
),
base AS MATERIALIZED (
 SELECT (e.occurred_at AT TIME ZONE 'Europe/Lisbon')::date AS report_day,
        e.installation_id,e.query_id,e.event,e.occurred_at
 FROM public.verix2_events e CROSS JOIN bounds b
 WHERE e.occurred_at>=b.start_at AND e.occurred_at<b.end_at
   AND e.event IN (
    'vehicle_lookup','vehicle_insurance_pending','vehicle_insurance_yes','vehicle_insurance_no',
    'vehicle_insurance_error','imt_loaded','module_open','history_open','history_reopen',
    'external_tool_open','alcohol_lookup','cinemometer_operation_start','cinemometer_speed_entry',
    'cinemometer_calculation','cinemometer_copy_code','cinemometer_copy_text','cinemometer_copy_location',
    'cinemometer_profile_select','cinemometer_profile_new','cinemometer_profile_duplicate',
    'cinemometer_profile_delete','cinemometer_profile_save','legislation_category_open',
    'legislation_search','legislation_copy','legislation_favorite_toggle'
   )
),
action_events AS MATERIALIZED (
 SELECT report_day,installation_id,occurred_at,event FROM base
 WHERE installation_id IS NOT NULL AND event IN (
   'vehicle_lookup','vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error',
   'imt_loaded','module_open','history_open','history_reopen','external_tool_open','alcohol_lookup',
   'cinemometer_operation_start','cinemometer_speed_entry','cinemometer_calculation',
   'cinemometer_copy_code','cinemometer_copy_text','cinemometer_copy_location',
   'cinemometer_profile_select','cinemometer_profile_new','cinemometer_profile_duplicate',
   'cinemometer_profile_delete','cinemometer_profile_save','legislation_category_open',
   'legislation_search','legislation_copy','legislation_favorite_toggle'
 )
),
active_by_day AS (
 SELECT report_day,count(DISTINCT installation_id)::bigint AS active_installations
 FROM action_events GROUP BY report_day
),
active_overall AS (
 SELECT count(DISTINCT installation_id)::bigint AS unique_installations FROM action_events
),
query_start_candidates AS (
 SELECT occurred_at,query_id FROM base WHERE event='vehicle_lookup' AND query_id IS NOT NULL
 UNION ALL
 SELECT min(e.occurred_at),e.query_id FROM base e
 WHERE e.event='vehicle_insurance_pending' AND e.query_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.verix2_events l WHERE l.query_id=e.query_id AND l.event='vehicle_lookup')
 GROUP BY e.query_id
),
query_starts AS (
 SELECT query_id,min(occurred_at) AS started_at FROM query_start_candidates GROUP BY query_id
),
consultations_by_day AS (
 SELECT (started_at AT TIME ZONE 'Europe/Lisbon')::date AS report_day,count(*)::bigint AS consultations
 FROM query_starts GROUP BY 1
)
SELECT jsonb_build_object(
 'generatedAt',p_now,'resetAt',(SELECT reset_at FROM reset_marker),
 'firstDay',to_char(first_day,'YYYY-MM-DD'),'lastDay',to_char(last_day,'YYYY-MM-DD'),
 'uniqueInstallationsSinceReset',(SELECT unique_installations FROM active_overall),
 'days',(SELECT jsonb_agg(jsonb_build_object(
   'day',to_char(d.report_day,'YYYY-MM-DD'),
   'activeInstallations',coalesce(a.active_installations,0),
   'consultations',coalesce(c.consultations,0)
 ) ORDER BY d.report_day)
 FROM days d LEFT JOIN active_by_day a ON a.report_day=d.report_day
 LEFT JOIN consultations_by_day c ON c.report_day=d.report_day)
)
FROM local_dates;
$function$;
REVOKE ALL ON FUNCTION public.verix2_admin_daily_trend_since_reset(timestamp with time zone) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_admin_daily_trend_since_reset(timestamp with time zone) TO service_role;

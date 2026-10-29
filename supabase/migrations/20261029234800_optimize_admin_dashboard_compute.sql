
-- Optimize VÉRIX Admin dashboard aggregation.
-- Keep the wide activity scan index-only where possible. The old NOT (event =
-- vehicle_insurance_error AND EXISTS(...)) expression caused PostgreSQL to
-- check the exclusions relation while scanning every activity row, making a
-- 140k-row scan take nearly 90 seconds. Exclude this event type from the main
-- scan and append back only non-excluded error rows.
DO $optimize_admin_dashboard_compute$
DECLARE
  v_def text;
  v_start integer;
  v_end integer;
  v_new_cte text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO STRICT v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='verix2_admin_dashboard_v3_compute'
    AND pg_get_function_identity_arguments(p.oid)='p_now timestamp with time zone';

  v_start := position('ev AS MATERIALIZED (' IN v_def);
  v_end := position('meta_ev AS MATERIALIZED (' IN v_def);
  IF v_start = 0 OR v_end <= v_start THEN
    RAISE EXCEPTION 'Could not locate dashboard activity CTE boundaries';
  END IF;

  v_new_cte := $new$
ev AS MATERIALIZED (
  -- Keep the hot path narrow and do not probe the exclusions table for every
  -- activity row. Only the small insurance-error subset needs that lookup.
  SELECT
    e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
    AND e.event <> 'vehicle_insurance_error'
    AND e.event IN (
      'vehicle_lookup', 'vehicle_insurance_pending',
      'vehicle_insurance_yes', 'vehicle_insurance_no', 'vehicle_insurance_error',
      'imt_loaded', 'module_open', 'history_open', 'history_reopen',
      'external_tool_open', 'alcohol_lookup',
      'cinemometer_operation_start', 'cinemometer_speed_entry',
      'cinemometer_calculation', 'cinemometer_copy_code',
      'cinemometer_copy_text', 'cinemometer_copy_location',
      'cinemometer_profile_select', 'cinemometer_profile_new',
      'cinemometer_profile_duplicate', 'cinemometer_profile_delete',
      'cinemometer_profile_save', 'legislation_category_open',
      'legislation_search', 'legislation_copy', 'legislation_favorite_toggle'
    )
  UNION ALL
  SELECT
    e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'vehicle_insurance_error'
    AND e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
    AND NOT EXISTS (
      SELECT 1
      FROM public.verix2_admin_error_stats_exclusions x
      WHERE x.event_id = e.event_id
    )
),
$new$;

  v_def := substr(v_def, 1, v_start - 1)
        || v_new_cte
        || substr(v_def, v_end);

  EXECUTE v_def;
END
$optimize_admin_dashboard_compute$;


-- Optimize VÉRIX Admin's 30-day daily trend.
-- Keep the wide activity scan index-only where possible. Exclusion checks only
-- apply to vehicle_insurance_error events, so read that small subset separately
-- instead of probing the exclusions relation for every activity row.
-- Deliberately excluded test errors are also filtered from technical error counts.
DO $optimize_admin_daily_trend$
DECLARE
  v_def text;
  v_old text;
  v_new text;
  v_hits integer;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO STRICT v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='verix2_admin_daily_trend_30d'
    AND pg_get_function_identity_arguments(p.oid)='p_now timestamp with time zone';

  v_old := $old$
  WHERE e.occurred_at >= b.start_at
    AND e.occurred_at < b.end_at
    AND NOT (
      e.event = 'vehicle_insurance_error'
      AND EXISTS (
        SELECT 1 FROM public.verix2_admin_error_stats_exclusions x
        WHERE x.event_id = e.event_id
      )
    )
    AND e.event IN (
$old$;
  v_new := $new$
  WHERE e.occurred_at >= b.start_at
    AND e.occurred_at < b.end_at
    AND e.event <> 'vehicle_insurance_error'
    AND e.event IN (
$new$;
  v_hits := (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old);
  IF v_hits <> 1 THEN RAISE EXCEPTION 'Expected one base scan filter marker, found %',v_hits; END IF;
  v_def := replace(v_def,v_old,v_new);

  v_old := $old$
),
action_events AS MATERIALIZED (
$old$;
  v_new := $new$
  UNION ALL
  SELECT
    (e.occurred_at AT TIME ZONE 'Europe/Lisbon')::date AS report_day,
    e.installation_id,
    e.query_id,
    e.event,
    e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN bounds b
  WHERE e.event = 'vehicle_insurance_error'
    AND e.occurred_at >= b.start_at
    AND e.occurred_at < b.end_at
    AND NOT EXISTS (
      SELECT 1 FROM public.verix2_admin_error_stats_exclusions x
      WHERE x.event_id = e.event_id
    )
),
action_events AS MATERIALIZED (
$new$;
  v_hits := (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old);
  IF v_hits <> 1 THEN RAISE EXCEPTION 'Expected one base/action boundary marker, found %',v_hits; END IF;
  v_def := replace(v_def,v_old,v_new);

  v_old := $old$
  WHERE e.event = 'vehicle_insurance_error'
    AND e.occurred_at >= b.asf_start_at
    AND e.occurred_at < b.end_at
),
classified_errors AS MATERIALIZED (
$old$;
  v_new := $new$
  WHERE e.event = 'vehicle_insurance_error'
    AND e.occurred_at >= b.asf_start_at
    AND e.occurred_at < b.end_at
    AND NOT EXISTS (
      SELECT 1 FROM public.verix2_admin_error_stats_exclusions x
      WHERE x.event_id = e.event_id
    )
),
classified_errors AS MATERIALIZED (
$new$;
  v_hits := (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old);
  IF v_hits <> 1 THEN RAISE EXCEPTION 'Expected one error-candidates boundary marker, found %',v_hits; END IF;
  v_def := replace(v_def,v_old,v_new);

  EXECUTE v_def;
END
$optimize_admin_daily_trend$;

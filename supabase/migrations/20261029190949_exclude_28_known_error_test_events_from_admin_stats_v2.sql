-- Exclude the 23 earlier security_auth events and 5 controlled proxy-rotation test
-- events from Admin error statistics. Keep source events in verix2_events for audit.
CREATE TABLE IF NOT EXISTS public.verix2_admin_error_stats_exclusions (
  event_id text PRIMARY KEY,
  occurred_at timestamptz NOT NULL,
  category text NOT NULL,
  reason text NOT NULL,
  excluded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.verix2_admin_error_stats_exclusions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.verix2_admin_error_stats_exclusions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.verix2_admin_error_stats_exclusions TO service_role;

INSERT INTO public.verix2_admin_error_stats_exclusions(event_id, occurred_at, category, reason)
SELECT e.event_id, e.occurred_at,
  CASE WHEN t.error_type='security_auth' THEN 'earlier-today-errors' ELSE 'proxy-rotation-test-errors' END,
  CASE WHEN t.error_type='security_auth'
    THEN 'Operator-requested exclusion of 23 earlier errors from Admin statistics'
    ELSE 'Operator-requested exclusion of 5 proxy-rotation test errors from Admin statistics' END
FROM public.verix2_events e
CROSS JOIN LATERAL (
  SELECT coalesce(nullif(e.metadata->'asfDiagnostic'->>'asfErrorType',''),
    nullif(e.metadata->>'asfErrorType',''),nullif(e.metadata->>'errorType',''),'unknown') AS error_type
) t
WHERE e.event='vehicle_insurance_error'
 AND (
   (t.error_type='security_auth'
    AND e.occurred_at >= '2026-10-29T14:46:00.071Z'::timestamptz
    AND e.occurred_at <= '2026-10-29T16:11:12.920Z'::timestamptz)
   OR
   (t.error_type='graphql_service_unavailable'
    AND e.occurred_at >= '2026-10-29T18:48:50.115Z'::timestamptz
    AND e.occurred_at <= '2026-10-29T18:50:31.980Z'::timestamptz)
 )
ON CONFLICT(event_id) DO NOTHING;

DO $rewrite_error_stats$
DECLARE d text; o text; r text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO STRICT d
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='verix2_admin_dashboard_v3_compute'
    AND pg_get_function_identity_arguments(p.oid)='p_now timestamp with time zone';
  IF position('verix2_admin_error_stats_exclusions' IN d)=0 THEN
    o := $old$AND e.occurred_at < b.report_end
    AND e.event IN ($old$;
    r := $new$AND e.occurred_at < b.report_end
    AND NOT (e.event='vehicle_insurance_error' AND EXISTS (
      SELECT 1 FROM public.verix2_admin_error_stats_exclusions x WHERE x.event_id=e.event_id
    ))
    AND e.event IN ($new$;
    IF (length(d)-length(replace(d,o,'')))/length(o) <> 2 THEN RAISE EXCEPTION 'dashboard markers mismatch'; END IF;
    EXECUTE replace(d,o,r);
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO STRICT d
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='verix2_admin_insurance_delta_v1'
    AND pg_get_function_identity_arguments(p.oid)='p_since timestamp with time zone, p_now timestamp with time zone, p_today_start timestamp with time zone, p_week_start timestamp with time zone, p_total_start timestamp with time zone';
  IF position('verix2_admin_error_stats_exclusions' IN d)=0 THEN
    o := $old$AND e.occurred_at < b.now_at
    AND e.event IN ($old$;
    r := $new$AND e.occurred_at < b.now_at
    AND NOT (e.event='vehicle_insurance_error' AND EXISTS (
      SELECT 1 FROM public.verix2_admin_error_stats_exclusions x WHERE x.event_id=e.event_id
    ))
    AND e.event IN ($new$;
    IF (length(d)-length(replace(d,o,'')))/length(o) <> 1 THEN RAISE EXCEPTION 'delta marker mismatch'; END IF;
    EXECUTE replace(d,o,r);
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO STRICT d
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='verix2_admin_error_ledger_v3'
    AND pg_get_function_identity_arguments(p.oid)='p_period text, p_now timestamp with time zone, p_limit integer, p_offset integer';
  IF position('verix2_admin_error_stats_exclusions' IN d)=0 THEN
    o := $old$WHERE e.event = 'vehicle_insurance_error'
    AND e.occurred_at >= b.start_at$old$;
    r := $new$WHERE e.event = 'vehicle_insurance_error'
    AND NOT EXISTS (SELECT 1 FROM public.verix2_admin_error_stats_exclusions x WHERE x.event_id=e.event_id)
    AND e.occurred_at >= b.start_at$new$;
    IF position(o IN d)=0 THEN RAISE EXCEPTION 'ledger marker mismatch'; END IF;
    EXECUTE replace(d,o,r);
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO STRICT d
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='verix2_admin_errors_fast'
    AND pg_get_function_identity_arguments(p.oid)='p_now timestamp with time zone';
  IF position('verix2_admin_error_stats_exclusions' IN d)=0 THEN
    o := $old$WHERE v.occurred_at>=b.s24 AND v.occurred_at<b.enow
    AND v.event IN ($old$;
    r := $new$WHERE v.occurred_at>=b.s24 AND v.occurred_at<b.enow
    AND NOT (v.event='vehicle_insurance_error' AND EXISTS (
      SELECT 1 FROM public.verix2_admin_error_stats_exclusions x WHERE x.event_id=v.event_id
    ))
    AND v.event IN ($new$;
    IF position(o IN d)=0 THEN RAISE EXCEPTION 'fast error marker mismatch'; END IF;
    EXECUTE replace(d,o,r);
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO STRICT d
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='verix2_admin_daily_trend_30d'
    AND pg_get_function_identity_arguments(p.oid)='p_now timestamp with time zone';
  IF position('verix2_admin_error_stats_exclusions' IN d)=0 THEN
    o := $old$AND e.occurred_at < b.end_at
    AND e.event IN ($old$;
    r := $new$AND e.occurred_at < b.end_at
    AND NOT (e.event='vehicle_insurance_error' AND EXISTS (
      SELECT 1 FROM public.verix2_admin_error_stats_exclusions x WHERE x.event_id=e.event_id
    ))
    AND e.event IN ($new$;
    IF position(o IN d)=0 THEN RAISE EXCEPTION 'daily trend marker mismatch'; END IF;
    EXECUTE replace(d,o,r);
  END IF;
END
$rewrite_error_stats$;

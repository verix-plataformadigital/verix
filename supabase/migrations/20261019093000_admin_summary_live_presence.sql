-- Live metrics for the Admin summary use server receipt time (created_at), not client occurred_at.
-- Historical telemetry rows are preserved.
CREATE OR REPLACE FUNCTION public.verix2_admin_live_summary_v1(p_now timestamptz DEFAULT clock_timestamp())
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public, pg_catalog SET work_mem TO '4MB'
AS $function$
WITH bounds AS (SELECT coalesce(p_now, clock_timestamp()) AS now_at),
presence_events AS (
 SELECT e.session_id,
  max(e.created_at) FILTER (WHERE e.event IN ('app_open','heartbeat')) AS last_signal,
  max(e.created_at) FILTER (WHERE e.event='session_close') AS last_close
 FROM public.verix2_events e CROSS JOIN bounds b
 WHERE e.session_id IS NOT NULL AND e.event IN ('app_open','heartbeat','session_close')
  AND e.created_at >= b.now_at-interval '3 minutes' AND e.created_at <= b.now_at+interval '30 seconds'
 GROUP BY e.session_id
),
online AS (
 SELECT session_id FROM presence_events p CROSS JOIN bounds b
 WHERE p.last_signal >= b.now_at-interval '150 seconds'
  AND (p.last_close IS NULL OR p.last_signal>p.last_close)
),
recent_lookups AS (
 SELECT e.query_id, min(e.created_at) AS started_received
 FROM public.verix2_events e CROSS JOIN bounds b
 WHERE e.event='vehicle_lookup' AND e.query_id IS NOT NULL
  AND e.created_at >= b.now_at-interval '3 minutes' AND e.created_at <= b.now_at+interval '30 seconds'
 GROUP BY e.query_id
),
in_progress AS (
 SELECT l.query_id FROM recent_lookups l CROSS JOIN bounds b
 WHERE l.started_received >= b.now_at-interval '2 minutes'
 AND NOT EXISTS (
  SELECT 1 FROM public.verix2_events f
  WHERE f.query_id=l.query_id AND f.event IN ('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')
   AND f.created_at>=l.started_received AND f.created_at<=b.now_at+interval '30 seconds'
 )
),
consulted_hour AS (
 SELECT count(DISTINCT e.installation_id)::bigint AS installations FROM public.verix2_events e CROSS JOIN bounds b
 WHERE e.event='vehicle_lookup' AND e.installation_id IS NOT NULL
  AND e.created_at>=b.now_at-interval '1 hour' AND e.created_at<=b.now_at+interval '30 seconds'
),
registered AS (SELECT count(*)::bigint AS installations FROM public.verix2_installations)
SELECT jsonb_build_object(
 'onlineNow',(SELECT count(*)::bigint FROM online),
 'consultationsInProgress',(SELECT count(*)::bigint FROM in_progress),
 'installationsConsultedLastHour',(SELECT installations FROM consulted_hour),
 'registeredInstallations',(SELECT installations FROM registered),
 'observedAt',(SELECT now_at FROM bounds)
);
$function$;
REVOKE ALL ON FUNCTION public.verix2_admin_live_summary_v1(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_admin_live_summary_v1(timestamptz) TO service_role;
DO $assert$
DECLARE r jsonb;
BEGIN
 r:=public.verix2_admin_live_summary_v1(clock_timestamp());
 IF jsonb_typeof(r->'onlineNow')<>'number' OR jsonb_typeof(r->'consultationsInProgress')<>'number'
 OR jsonb_typeof(r->'installationsConsultedLastHour')<>'number' OR jsonb_typeof(r->'registeredInstallations')<>'number'
 OR r->>'observedAt' IS NULL THEN RAISE EXCEPTION 'Live summary contract assertion failed: %',r; END IF;
END $assert$;

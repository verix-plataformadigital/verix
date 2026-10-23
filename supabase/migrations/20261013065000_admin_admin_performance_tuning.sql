-- Admin performance tuning: consolidate auxiliary telemetry counts and avoid duplicate cache refreshes.
BEGIN;

CREATE OR REPLACE FUNCTION public.verix2_admin_auxiliary_fast(p_now timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
 SET work_mem TO '16MB'
AS $function$
WITH b AS (
  SELECT
    greatest(p_now - interval '24 hours',
      coalesce((SELECT reset_24h_at FROM public.verix2_dashboard_state WHERE singleton=true),
               '1970-01-01T00:00:00Z'::timestamptz)) AS s24,
    greatest(p_now - interval '7 days', public.verix2_all_start(p_now)) AS s7,
    greatest(p_now - interval '30 days', public.verix2_all_start(p_now)) AS s30,
    public.verix2_all_start(p_now) AS s_all,
    p_now AS enow
),
leg_events AS MATERIALIZED (
  SELECT e.event, e.occurred_at, e.metadata
  FROM public.verix2_events e, b
  WHERE e.occurred_at >= b.s_all AND e.occurred_at < b.enow
    AND e.event IN ('legislation_category_open','legislation_search','legislation_copy','legislation_favorite_toggle')
),
legislation_counts AS (
  SELECT jsonb_build_object(
    '24h',jsonb_build_object(
      'opens',count(*) FILTER(WHERE occurred_at>=b.s24 AND event='legislation_category_open'),
      'searches',count(*) FILTER(WHERE occurred_at>=b.s24 AND event='legislation_search'),
      'copies',count(*) FILTER(WHERE occurred_at>=b.s24 AND event='legislation_copy'),
      'favorites',count(*) FILTER(WHERE occurred_at>=b.s24 AND event='legislation_favorite_toggle')),
    '7d',jsonb_build_object(
      'opens',count(*) FILTER(WHERE occurred_at>=b.s7 AND event='legislation_category_open'),
      'searches',count(*) FILTER(WHERE occurred_at>=b.s7 AND event='legislation_search'),
      'copies',count(*) FILTER(WHERE occurred_at>=b.s7 AND event='legislation_copy'),
      'favorites',count(*) FILTER(WHERE occurred_at>=b.s7 AND event='legislation_favorite_toggle')),
    '30d',jsonb_build_object(
      'opens',count(*) FILTER(WHERE occurred_at>=b.s30 AND event='legislation_category_open'),
      'searches',count(*) FILTER(WHERE occurred_at>=b.s30 AND event='legislation_search'),
      'copies',count(*) FILTER(WHERE occurred_at>=b.s30 AND event='legislation_copy'),
      'favorites',count(*) FILTER(WHERE occurred_at>=b.s30 AND event='legislation_favorite_toggle')),
    'total',jsonb_build_object(
      'opens',count(*) FILTER(WHERE event='legislation_category_open'),
      'searches',count(*) FILTER(WHERE event='legislation_search'),
      'copies',count(*) FILTER(WHERE event='legislation_copy'),
      'favorites',count(*) FILTER(WHERE event='legislation_favorite_toggle'))
  ) AS data
  FROM leg_events, b
),
legislation_items AS (
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC, x.item_label),'[]'::jsonb) AS data
  FROM (
    SELECT e.metadata->>'itemId' AS item_id,
           e.metadata->>'itemLabel' AS item_label,
           count(*) AS qty,
           count(*) FILTER(WHERE e.metadata->>'copyType'='code') AS code_qty,
           count(*) FILTER(WHERE e.metadata->>'copyType'='description') AS desc_qty,
           count(*) FILTER(WHERE e.metadata->>'copyType'='all') AS all_qty
    FROM public.verix2_events e, b
    WHERE e.event='legislation_copy'
      AND e.occurred_at>=b.s30 AND e.occurred_at<b.enow
    GROUP BY 1,2
    ORDER BY qty DESC, item_label
    LIMIT 30
  ) x
),
final_counts AS (
  SELECT e.query_id,
         count(*) AS final_event_count,
         (array_agg(e.metadata ORDER BY e.occurred_at DESC,e.event_id DESC))[1] AS metadata,
         max(e.occurred_at) AS occurred_at
  FROM public.verix2_events e, b
  WHERE e.event IN ('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')
    AND e.query_id IS NOT NULL
    AND e.occurred_at>=b.s30 AND e.occurred_at<b.enow
  GROUP BY e.query_id
),
valid_finals AS (
  SELECT metadata, occurred_at
  FROM final_counts
  WHERE final_event_count=1
),
insurance_quality AS (
  SELECT jsonb_build_object(
    'latency_p50_ms',(
      SELECT round((percentile_cont(.5) WITHIN GROUP(
        ORDER BY (f.metadata->'asfDiagnostic'->>'asfDurationMs')::numeric))::numeric,0)
      FROM valid_finals f,b
      WHERE f.occurred_at>=b.s24
        AND (f.metadata->'asfDiagnostic'->>'asfDurationMs')~'^[0-9]+(\.[0-9]+)?$'),
    'latency_p95_ms',(
      SELECT round((percentile_cont(.95) WITHIN GROUP(
        ORDER BY (f.metadata->'asfDiagnostic'->>'asfDurationMs')::numeric))::numeric,0)
      FROM valid_finals f,b
      WHERE f.occurred_at>=b.s24
        AND (f.metadata->'asfDiagnostic'->>'asfDurationMs')~'^[0-9]+(\.[0-9]+)?$'),
    'known_plates_24h',(
      SELECT count(DISTINCT upper(regexp_replace(coalesce(
        f.metadata->'asfDiagnostic'->>'matricula',f.metadata->>'matricula',''),'[^A-Z0-9]','','g')))
      FROM valid_finals f,b
      WHERE f.occurred_at>=b.s24
        AND coalesce(f.metadata->'asfDiagnostic'->>'matricula',f.metadata->>'matricula','')<>''),
    'known_plates_30d',(
      SELECT count(DISTINCT upper(regexp_replace(coalesce(
        f.metadata->'asfDiagnostic'->>'matricula',f.metadata->>'matricula',''),'[^A-Z0-9]','','g')))
      FROM valid_finals f
      WHERE coalesce(f.metadata->'asfDiagnostic'->>'matricula',f.metadata->>'matricula','')<>'')
  ) AS data
),
telemetry_agg AS (
  SELECT
    count(*) AS events_30d,
    count(*) FILTER (WHERE e.event='heartbeat') AS heartbeats_30d,
    count(*) FILTER (WHERE e.event IN (
      'app_open','heartbeat','cinemometer_calculation','cinemometer_speed_entry',
      'vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error'
    )) AS client_events,
    count(*) FILTER (WHERE e.event IN (
      'app_open','heartbeat','cinemometer_calculation','cinemometer_speed_entry',
      'vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error'
    ) AND e.metadata ? 'client') AS client_with_metadata,
    count(*) FILTER (WHERE e.event IN (
      'vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error'
    )) AS asf_events,
    count(*) FILTER (WHERE e.event IN (
      'vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error'
    ) AND e.metadata ? 'asfDiagnostic') AS asf_with_diagnostic,
    count(*) FILTER (WHERE e.event IN (
      'cinemometer_calculation','cinemometer_speed_entry'
    )) AS cin_events,
    count(*) FILTER (WHERE e.event IN (
      'cinemometer_calculation','cinemometer_speed_entry'
    ) AND e.metadata ? 'cin') AS cin_with_detail
  FROM public.verix2_events e,b
  WHERE e.occurred_at>=b.s30 AND e.occurred_at<b.enow
),
telemetry AS (
  SELECT jsonb_build_object(
    'events_30d',events_30d,
    'heartbeats_30d',heartbeats_30d,
    'client_coverage_30d',round((100.0*client_with_metadata/NULLIF(client_events,0))::numeric,1),
    'asf_diagnostic_coverage_30d',round((100.0*asf_with_diagnostic/NULLIF(asf_events,0))::numeric,1),
    'cin_detail_coverage_30d',round((100.0*cin_with_detail/NULLIF(cin_events,0))::numeric,1)
  ) AS data
  FROM telemetry_agg
)
SELECT jsonb_build_object(
  'legislation',jsonb_build_object(
    'counts',(SELECT data FROM legislation_counts),
    'items',(SELECT data FROM legislation_items)),
  'insurance_quality',(SELECT data FROM insurance_quality),
  'telemetry',(SELECT data FROM telemetry)
);
$function$;

CREATE OR REPLACE FUNCTION public.verix2_admin_dashboard_cached(
  p_now timestamptz DEFAULT now(),
  p_force_refresh boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
SET work_mem TO '48MB'
AS $function$
DECLARE
  v_requested_at timestamptz := clock_timestamp();
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_live boolean;
  v_reset24 timestamptz;
  v_reset_all timestamptz;
  v_cache_reset24 timestamptz;
  v_cache_reset_all timestamptz;
  v_payload jsonb;
  v_cached_at timestamptz;
  v_compatible boolean := false;
  v_lock_key bigint := hashtextextended('verix2_admin_dashboard_shared_cache', 0);
BEGIN
  v_live := abs(extract(epoch FROM (v_now - clock_timestamp()))) <= 10;

  IF NOT v_live THEN
    RETURN public.verix2_admin_dashboard_fast(v_now);
  END IF;

  SELECT s.reset_24h_at, s.reset_all_at
    INTO v_reset24, v_reset_all
  FROM public.verix2_dashboard_state s
  WHERE s.singleton = true;

  SELECT c.refreshed_at, c.reset_24h_at, c.reset_all_at, c.payload
    INTO v_cached_at, v_cache_reset24, v_cache_reset_all, v_payload
  FROM public.verix2_admin_dashboard_cache c
  WHERE c.singleton = true;

  v_compatible := FOUND
    AND v_cache_reset24 IS NOT DISTINCT FROM v_reset24
    AND v_cache_reset_all IS NOT DISTINCT FROM v_reset_all;

  IF v_compatible AND NOT coalesce(p_force_refresh, false) THEN
    IF v_cached_at >= clock_timestamp() - interval '45 seconds' THEN
      RETURN v_payload;
    END IF;
    IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
      RETURN v_payload;
    END IF;
  ELSE
    PERFORM pg_advisory_xact_lock(v_lock_key);
  END IF;

  SELECT c.refreshed_at, c.reset_24h_at, c.reset_all_at, c.payload
    INTO v_cached_at, v_cache_reset24, v_cache_reset_all, v_payload
  FROM public.verix2_admin_dashboard_cache c
  WHERE c.singleton = true;

  v_compatible := FOUND
    AND v_cache_reset24 IS NOT DISTINCT FROM v_reset24
    AND v_cache_reset_all IS NOT DISTINCT FROM v_reset_all;

  -- Coalesce concurrent refresh requests, including an Admin click overlapping cron.
  IF v_compatible AND v_payload IS NOT NULL
     AND v_cached_at >= v_requested_at THEN
    RETURN v_payload;
  END IF;

  IF v_compatible
     AND NOT coalesce(p_force_refresh, false)
     AND v_cached_at >= clock_timestamp() - interval '45 seconds' THEN
    RETURN v_payload;
  END IF;

  BEGIN
    v_payload := public.verix2_admin_dashboard_fast(v_now);
  EXCEPTION WHEN OTHERS THEN
    IF v_compatible
       AND v_cached_at >= clock_timestamp() - interval '5 minutes'
       AND v_payload IS NOT NULL THEN
      RETURN v_payload;
    END IF;
    RAISE;
  END;

  INSERT INTO public.verix2_admin_dashboard_cache
    (singleton, refreshed_at, reset_24h_at, reset_all_at, payload)
  VALUES
    (true, clock_timestamp(), v_reset24, v_reset_all, v_payload)
  ON CONFLICT (singleton) DO UPDATE
    SET refreshed_at = EXCLUDED.refreshed_at,
        reset_24h_at = EXCLUDED.reset_24h_at,
        reset_all_at = EXCLUDED.reset_all_at,
        payload = EXCLUDED.payload;

  RETURN v_payload;
END;
$function$;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'verix2_admin_dashboard_cache_refresh';

SELECT cron.schedule(
  'verix2_admin_dashboard_cache_refresh',
  '* * * * *',
  'SELECT public.verix2_admin_dashboard_cached(now(), false);'
);

COMMENT ON FUNCTION public.verix2_admin_auxiliary_fast(timestamptz) IS
  'Targeted auxiliary Admin metrics with telemetry coverage aggregated in one pass, without module-transition analysis.';

COMMIT;

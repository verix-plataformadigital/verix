-- Targeted metrics for Admin tabs, so routine navigation does not run the whole-history analytics RPC.
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
telemetry AS (
  SELECT jsonb_build_object(
    'events_30d',(SELECT count(*) FROM public.verix2_events e,b
      WHERE e.occurred_at>=b.s30 AND e.occurred_at<b.enow),
    'heartbeats_30d',(SELECT count(*) FROM public.verix2_events e,b
      WHERE e.event='heartbeat' AND e.occurred_at>=b.s30 AND e.occurred_at<b.enow),
    'client_coverage_30d',(
      SELECT round((100.0*(d.n-m.n)/NULLIF(d.n,0))::numeric,1)
      FROM
        (SELECT count(*)::numeric n FROM public.verix2_events e,b
         WHERE e.event IN('app_open','heartbeat','cinemometer_calculation','cinemometer_speed_entry',
                          'vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')
           AND e.occurred_at>=b.s30 AND e.occurred_at<b.enow) d,
        (SELECT count(*)::numeric n FROM public.verix2_events e,b
         WHERE e.event IN('app_open','heartbeat','cinemometer_calculation','cinemometer_speed_entry',
                          'vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')
           AND e.occurred_at>=b.s30 AND e.occurred_at<b.enow
           AND NOT (e.metadata ? 'client')) m
    ),
    'asf_diagnostic_coverage_30d',(
      SELECT round((100.0*(d.n-m.n)/NULLIF(d.n,0))::numeric,1)
      FROM
        (SELECT count(*)::numeric n FROM public.verix2_events e,b
         WHERE e.event IN('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')
           AND e.occurred_at>=b.s30 AND e.occurred_at<b.enow) d,
        (SELECT count(*)::numeric n FROM public.verix2_events e,b
         WHERE e.event IN('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')
           AND e.occurred_at>=b.s30 AND e.occurred_at<b.enow
           AND NOT (e.metadata ? 'asfDiagnostic')) m
    ),
    'cin_detail_coverage_30d',(
      SELECT round((100.0*(d.n-m.n)/NULLIF(d.n,0))::numeric,1)
      FROM
        (SELECT count(*)::numeric n FROM public.verix2_events e,b
         WHERE e.event IN('cinemometer_calculation','cinemometer_speed_entry')
           AND e.occurred_at>=b.s30 AND e.occurred_at<b.enow) d,
        (SELECT count(*)::numeric n FROM public.verix2_events e,b
         WHERE e.event IN('cinemometer_calculation','cinemometer_speed_entry')
           AND e.occurred_at>=b.s30 AND e.occurred_at<b.enow
           AND NOT (e.metadata ? 'cin')) m
    )
  ) AS data
)
SELECT jsonb_build_object(
  'legislation',jsonb_build_object(
    'counts',(SELECT data FROM legislation_counts),
    'items',(SELECT data FROM legislation_items)),
  'insurance_quality',(SELECT data FROM insurance_quality),
  'telemetry',(SELECT data FROM telemetry)
);
$function$;

REVOKE ALL ON FUNCTION public.verix2_admin_auxiliary_fast(timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_admin_auxiliary_fast(timestamp with time zone) TO service_role;

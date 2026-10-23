-- Keep only the ASF fields required by metrics in the grouped CTE.
-- Duplicate query groups are excluded; scalar max values are exact for valid single-final groups.
CREATE OR REPLACE FUNCTION public.verix2_admin_auxiliary_fast(p_now timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
 SET work_mem TO '16MB'
AS $function$
WITH b AS (
  SELECT
    (date_trunc('day', p_now AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'Europe/Lisbon') AS s24,
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
         max(e.metadata->'asfDiagnostic'->>'asfDurationMs') AS duration_text,
         max(coalesce(e.metadata->'asfDiagnostic'->>'matricula',e.metadata->>'matricula','')) AS plate_text,
         max(e.occurred_at) AS occurred_at
  FROM public.verix2_events e, b
  WHERE e.event IN ('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')
    AND e.query_id IS NOT NULL
    AND e.occurred_at>=b.s30 AND e.occurred_at<b.enow
  GROUP BY e.query_id
),
valid_finals AS (
  SELECT duration_text, plate_text, occurred_at
  FROM final_counts
  WHERE final_event_count=1
),
insurance_quality AS (
  SELECT jsonb_build_object(
    'latency_p50_ms',(
      SELECT round((percentile_cont(.5) WITHIN GROUP(
        ORDER BY f.duration_text::numeric))::numeric,0)
      FROM valid_finals f,b
      WHERE f.occurred_at>=b.s24
        AND f.duration_text~'^[0-9]+(\.[0-9]+)?$'),
    'latency_p95_ms',(
      SELECT round((percentile_cont(.95) WITHIN GROUP(
        ORDER BY f.duration_text::numeric))::numeric,0)
      FROM valid_finals f,b
      WHERE f.occurred_at>=b.s24
        AND f.duration_text~'^[0-9]+(\.[0-9]+)?$'),
    'known_plates_24h',(
      SELECT count(DISTINCT upper(regexp_replace(f.plate_text,'[^A-Z0-9]','','g')))
      FROM valid_finals f,b
      WHERE f.occurred_at>=b.s24
        AND f.plate_text<>''),
    'known_plates_30d',(
      SELECT count(DISTINCT upper(regexp_replace(f.plate_text,'[^A-Z0-9]','','g')))
      FROM valid_finals f
      WHERE f.plate_text<>'')
  ) AS data
),
telemetry_agg AS (
  SELECT
    (SELECT count(*) FROM public.verix2_events e
      WHERE e.occurred_at>=b.s30 AND e.occurred_at<b.enow
        AND e.event IN ('app_open','heartbeat','cinemometer_calculation','cinemometer_speed_entry',
                        'vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')) AS client_events,
    (SELECT count(*) FROM public.verix2_events e
      WHERE e.occurred_at>=b.s30 AND e.occurred_at<b.enow
        AND e.event IN ('app_open','heartbeat','cinemometer_calculation','cinemometer_speed_entry',
                        'vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')
        AND NOT (e.metadata ? 'client')) AS client_missing,
    (SELECT count(*) FROM public.verix2_events e
      WHERE e.occurred_at>=b.s30 AND e.occurred_at<b.enow
        AND e.event IN ('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')) AS asf_events,
    (SELECT count(*) FROM public.verix2_events e
      WHERE e.occurred_at>=b.s30 AND e.occurred_at<b.enow
        AND e.event IN ('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')
        AND NOT (e.metadata ? 'asfDiagnostic')) AS asf_missing,
    (SELECT count(*) FROM public.verix2_events e
      WHERE e.occurred_at>=b.s30 AND e.occurred_at<b.enow
        AND e.event IN ('cinemometer_calculation','cinemometer_speed_entry')) AS cin_events,
    (SELECT count(*) FROM public.verix2_events e
      WHERE e.occurred_at>=b.s30 AND e.occurred_at<b.enow
        AND e.event IN ('cinemometer_calculation','cinemometer_speed_entry')
        AND NOT (e.metadata ? 'cin')) AS cin_missing
  FROM b
),
telemetry AS (
  SELECT jsonb_build_object(
    'client_coverage_30d',round((100.0*(client_events-client_missing)/NULLIF(client_events,0))::numeric,1),
    'asf_diagnostic_coverage_30d',round((100.0*(asf_events-asf_missing)/NULLIF(asf_events,0))::numeric,1),
    'cin_detail_coverage_30d',round((100.0*(cin_events-cin_missing)/NULLIF(cin_events,0))::numeric,1)
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
